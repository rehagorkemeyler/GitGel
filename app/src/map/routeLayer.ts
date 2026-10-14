import type * as GeoJSON from 'geojson'
import { Marker, type GeoJSONSource, type Map as MlMap } from 'maplibre-gl'
import type { Itinerary, Leg } from '../lib/api'
import { decodePolyline } from '../lib/polyline'
import { ACCENT } from '../lib/colors'
import { fitCoords } from '../lib/camera'

const SRC = 'route'

// Other options than the first: grey and see-through (native ALT: #8e8e93 at 0.55), under the first one.
const ALT = '#8e8e93'
const ALT_OPACITY = 0.55
const WALK = '#8e8e93'
// Native flag glyph (RouteLayer.tsx), white on the red end disc.
const FLAG_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6Z" fill="#ffffff"/></svg>'

/** Route markers per map, so a new route (or none) replaces the old ones. */
const markers = new WeakMap<MlMap, Marker[]>()

function toGeoJSON(its: Itinerary[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  // Last option first, so the first (fastest / opened) one is drawn on top.
  its.forEach((it, rank) => features.push(...legFeatures(it, rank)))
  return { type: 'FeatureCollection', features }
}

function legFeatures(it: Itinerary, rank: number): GeoJSON.Feature[] {
  return it.legs.map((leg) => {
    const coords = leg.legGeometry
      ? decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6)
      : [
          [leg.from.lon, leg.from.lat],
          [leg.to.lon, leg.to.lat],
        ]
    const walk = leg.mode === 'WALK'
    return {
      type: 'Feature',
      properties: { walk, rank, color: rank > 0 ? ALT : walk ? WALK : leg.routeColor ? `#${leg.routeColor}` : ACCENT },
      geometry: { type: 'LineString', coordinates: coords },
    }
  })
}

/** A DOM marker centred on a point (native Marker with anchor 0.5, 0.5). */
function marker(map: MlMap, el: HTMLElement, p: { lat: number; lon: number }): Marker {
  return new Marker({ element: el, anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(map)
}

/** Line badge where you board: 22 dp high, 6 dp side padding, 7 dp radius, 1.5 dp white border. */
function badge(leg: Leg): HTMLElement {
  const el = document.createElement('div')
  el.className = 'route-badge'
  el.style.background = leg.routeColor ? `#${leg.routeColor}` : ACCENT
  el.style.color = `#${leg.routeTextColor || 'ffffff'}`
  el.textContent = leg.routeShortName ?? leg.mode
  el.setAttribute('aria-label', leg.routeShortName ?? leg.mode)
  return el
}

/** The badges, the start dot and the end flag of the first option (native RouteLayer). Drawn above the line. */
function placeMarkers(map: MlMap, main: Itinerary | undefined): void {
  for (const old of markers.get(map) ?? []) old.remove()
  const list: Marker[] = []
  if (main?.legs.length) {
    for (const leg of main.legs) if (leg.mode !== 'WALK') list.push(marker(map, badge(leg), leg.from))
    const start = document.createElement('div')
    start.className = 'route-start'
    list.push(marker(map, start, main.legs[0].from))
    const end = document.createElement('div')
    end.className = 'route-end'
    end.innerHTML = FLAG_SVG
    list.push(marker(map, end, main.legs[main.legs.length - 1].to))
  }
  markers.set(map, list)
}

/**
 * Draw (or clear) itineraries: the first in its line colours over a white edge, walks dotted, the
 * others grey and see-through (route results), or just the opened one. Safe to call again after a style change.
 * The camera is not moved here: see fitRoute.
 */
export function showRoute(map: MlMap, its: Itinerary[]): void {
  const data = toGeoJSON(its)
  const src = map.getSource(SRC) as GeoJSONSource | undefined
  if (src) {
    src.setData(data)
  } else {
    map.addSource(SRC, { type: 'geojson', data })
    const round = { 'line-cap': 'round', 'line-join': 'round' } as const
    // Other options first (native zIndex 10), then the first option's white edge (11), then its line (12).
    map.addLayer({
      id: 'route-alt',
      type: 'line',
      source: SRC,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['>', ['get', 'rank'], 0]],
      layout: round,
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': ALT_OPACITY,
        'line-width': ['case', ['get', 'walk'], 3, 5],
        // Alternative walks: 2 dp dashes, 6 dp gaps at 3 dp (native [2, 6]); dashes scale with the width.
        'line-dasharray': ['case', ['get', 'walk'], ['literal', [0.667, 2]], ['literal', [1, 0]]],
      },
    })
    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: SRC,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!', ['get', 'walk']], ['==', ['get', 'rank'], 0]],
      layout: round,
      paint: { 'line-color': '#ffffff', 'line-width': 10 },
    })
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: SRC,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'rank'], 0]],
      layout: round,
      paint: {
        'line-color': ['get', 'color'],
        // Walks: 4 dp with 2 dp dashes and 8 dp gaps (native [2, 8]); lines: 6 dp.
        'line-width': ['case', ['get', 'walk'], 4, 6],
        'line-dasharray': ['case', ['get', 'walk'], ['literal', [0.5, 2]], ['literal', [1, 0]]],
      },
    })
  }
  placeMarkers(map, its[0])
}

/**
 * Frames the options (or the opened route) above the sheet. Native fits 450 ms after the change,
 * once the sheet has settled: the caller schedules it. `bottomInset` is the map's bottom padding.
 */
export function fitRoute(map: MlMap, its: Itinerary[], bottomInset: number): void {
  const coords: [number, number][] = []
  for (const f of toGeoJSON(its).features) {
    if (f.geometry.type === 'LineString') coords.push(...(f.geometry.coordinates as [number, number][]))
  }
  fitCoords(map, coords, bottomInset)
}
