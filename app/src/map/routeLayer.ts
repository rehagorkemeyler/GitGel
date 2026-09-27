import type * as GeoJSON from 'geojson'
import type { GeoJSONSource, LngLatBoundsLike, Map as MlMap } from 'maplibre-gl'
import type { Itinerary } from '../lib/api'
import { decodePolyline } from '../lib/polyline'

const SRC = 'route'

// Other options than the first: grey and see-through, under the first one.
const ALT = '#8e8e93'

function toGeoJSON(its: Itinerary[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  // Last option first, so the first (fastest / opened) one is drawn on top.
  its.forEach((it, rank) => features.push(...legFeatures(it, rank)))
  return { type: 'FeatureCollection', features }
}

function legFeatures(it: Itinerary, rank: number): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = []
  for (const leg of it.legs) {
    const coords = leg.legGeometry
      ? decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6)
      : [
          [leg.from.lon, leg.from.lat],
          [leg.to.lon, leg.to.lat],
        ]
    const walk = leg.mode === 'WALK'
    features.push({
      type: 'Feature',
      properties: { walk, rank, color: rank > 0 ? ALT : walk ? '#8e8e93' : `#${leg.routeColor || '0a66c2'}` },
      geometry: { type: 'LineString', coordinates: coords },
    })
    if (!walk && rank === 0) {
      for (const p of [leg.from, leg.to]) {
        features.push({
          type: 'Feature',
          properties: { stop: true, rank, color: `#${leg.routeColor || '0a66c2'}` },
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        })
      }
    }
  }
  return features
}

/**
 * Draw (or clear) itineraries: the first in its line colours, the others grey and
 * see-through (route results), or just the opened one. Safe to call again after a style change.
 */
export function showRoute(map: MlMap, its: Itinerary[], bottomPadding: number): void {
  const data = toGeoJSON(its)
  const src = map.getSource(SRC) as GeoJSONSource | undefined
  if (src) {
    src.setData(data)
  } else {
    map.addSource(SRC, { type: 'geojson', data })
    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: SRC,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!', ['get', 'walk']], ['==', ['get', 'rank'], 0]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 9 },
    })
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: SRC,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['-', 0, ['get', 'rank']] },
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': ['case', ['>', ['get', 'rank'], 0], 0.45, 1],
        'line-width': ['case', ['get', 'walk'], 3, ['>', ['get', 'rank'], 0], 5, 6],
        'line-dasharray': ['case', ['get', 'walk'], ['literal', [1, 2]], ['literal', [1, 0]]],
      },
    })
    map.addLayer({
      id: 'route-stops',
      type: 'circle',
      source: SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 3,
      },
    })
  }
  if (!its.length) return
  let minX = 180, minY = 90, maxX = -180, maxY = -90
  for (const f of data.features) {
    const cs = f.geometry.type === 'LineString' ? f.geometry.coordinates : [(f.geometry as GeoJSON.Point).coordinates]
    for (const [x, y] of cs) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
  }
  const bounds: LngLatBoundsLike = [[minX, minY], [maxX, maxY]]
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  map.fitBounds(bounds, { padding: { top: 48, left: 32, right: 32, bottom: bottomPadding + 32 }, duration: reduce ? 0 : 400, maxZoom: 16 })
}
