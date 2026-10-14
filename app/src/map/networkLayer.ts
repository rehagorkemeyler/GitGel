import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import { loadJson, loadStops, type StopRow } from '../lib/data'
import { addTransitIcons, glyphFor } from './icons'
import { busShapes } from '../lib/city'
import { ACCENT } from '../lib/colors'

// Base transit layer, like Google Maps: rail/tram/funicular/cable car/ferry lines
// in their official colours, station markers, and bus stops when zoomed in.

export type Station = {
  id: string
  ids: string[]
  name: string
  lat: number
  lon: number
  mode: string
  lines: string[]
  /** More than one rail line: drawn 50% bigger. */
  transfer?: boolean
}

const NET = 'net-lines'
// Ankara: every bus route as a thin, faded line under the rail network.
const BUSNET = 'net-bus-lines'
const BUS_OPACITY = 0.1
const FERRY: ExpressionSpecification = ['==', ['get', 'mode'], 'ferry']
// Ferries: thin, faint dashes over the water; they must not compete with rail or the land.
const LINE_WIDTH: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 10, ['case', FERRY, 0.8, 2.5], 15, ['case', FERRY, 2, 6]]
const LINE_OPACITY: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 11, ['case', FERRY, 0.1, 1], 14, ['case', FERRY, 0.3, 1]]
const ST = 'net-stations'
const BUS = 'net-bus-stops'
const BUS_MIN_ZOOM = 14
/** Layers that take a tap on a station or a bus stop (MapView keeps empty-map taps apart from them). */
export const NET_TAP_LAYERS = [ST + '-dot', ST + '-far', BUS + '-dot']

export class NetworkLayer {
  private map: MlMap
  private focus: string[] | null = null
  private busLoaded = false
  onStation?: (s: Station) => void
  private stations = new Map<string, Station>()
  private ink = '#3a3a3c'
  // Highlighted bus line (buses have no official colours): the app accent (--accent).
  private accent = ACCENT

  constructor(map: MlMap) {
    this.map = map
    const click = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      const s = f && this.stations.get(String(f.properties?.id))
      if (s) this.onStation?.(s)
    }
    map.on('click', ST + '-dot', click)
    map.on('click', ST + '-far', click)
    map.on('click', BUS + '-dot', click)
    for (const id of [ST + '-dot', BUS + '-dot']) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
    }
    map.on('zoomend', () => this.maybeLoadBusStops())
  }

  /** (Re)add sources and layers; call after every style load. */
  async ensure() {
    const m = this.map
    if (m.getSource(NET)) return
    // Transit lines sit on top of every base-map layer (roads included), under our own markers.
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    const ink = dark ? '#e5e5ea' : '#3a3a3c'
    const paper = dark ? '#1c1c1e' : '#ffffff'
    // Native StopMarkers: far station dots are white, or #1c1e24 in dark.
    const stationFill = dark ? '#1c1e24' : '#ffffff'
    addTransitIcons(m, dark)
    m.addSource(NET, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addSource(ST, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addSource(BUS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    if (busShapes()) {
      m.addSource(BUSNET, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({
        id: BUSNET,
        type: 'line',
        source: BUSNET,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // Dozens of routes share the main roads: keep each one faint so they do not add up to a black band.
        paint: {
          'line-color': ink,
          'line-opacity': BUS_OPACITY,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 15, 1.2],
        },
      })
    }
    m.addLayer({
        id: NET + '-casing',
        type: 'line',
        source: NET,
        filter: ['!=', ['get', 'mode'], 'ferry'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': paper, 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 15, 9] },
      })
    m.addLayer({
        id: NET,
        type: 'line',
        source: NET,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': LINE_WIDTH,
          'line-dasharray': ['case', ['==', ['get', 'mode'], 'ferry'], ['literal', [2, 2]], ['literal', [1, 0]]],
          // Ferry hops fade in with zoom so the Bosphorus is not a web of lines.
          'line-opacity': LINE_OPACITY,
        },
      })
    m.addLayer({
      id: BUS + '-dot',
      type: 'symbol',
      source: BUS,
      minzoom: BUS_MIN_ZOOM,
      layout: {
        'icon-image': 'gg-busstop',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.75, 17, 1],
        'icon-allow-overlap': true,
      },
    })
    // Far away: small dots on the line (native: 8 px, transfer 12 px, outer size; the stroke sits outside the radius).
    // Closer: mode icons (train, tram, ferry...).
    m.addLayer({
      id: ST + '-far',
      type: 'circle',
      source: ST,
      minzoom: 10,
      maxzoom: 12.5,
      paint: {
        'circle-radius': ['case', ['get', 'transfer'], 4, 2.5],
        'circle-color': stationFill,
        'circle-stroke-color': ink,
        'circle-stroke-width': ['case', ['get', 'transfer'], 2, 1.5],
      },
    })
    m.addLayer({
      id: ST + '-dot',
      type: 'symbol',
      source: ST,
      minzoom: 12.5,
      layout: {
        'icon-image': ['concat', 'gg-', ['get', 'glyph']],
        // The glyph image is 22 px. Native: 16 px below zoom 15, 20 px from 15; transfers 1.3x (21 and 26 px).
        'icon-size': ['step', ['zoom'], ['case', ['get', 'transfer'], 0.9545, 0.7273], 15, ['case', ['get', 'transfer'], 1.1818, 0.9091]],
        'symbol-sort-key': ['case', ['get', 'transfer'], 0, 1],
        'icon-allow-overlap': true,
      },
    })
    this.ink = ink
    this.accent = ACCENT
    await this.load()
    this.applyFocus()
    this.busLoaded = false
    this.maybeLoadBusStops()
  }

  private async load() {
    const [net, stations, lines] = await Promise.all([
      loadJson<GeoJSON.FeatureCollection>('network.geojson'),
      loadJson<Station[]>('stations.json'),
      loadJson<{ id: string; color: string }[]>('lines.json'),
    ]).catch(() => [null, null, null] as const)
    if (!net || !stations || !lines) return
    if (busShapes())
      loadJson<GeoJSON.FeatureCollection>('bus-network.geojson').then(
        (b) => (this.map.getSource(BUSNET) as GeoJSONSource | undefined)?.setData(b),
        () => {},
      )
    const color = new Map(lines.map((l) => [l.id, l.color ? `#${l.color}` : '#3a3a3c']))
    this.stations = new Map(stations.map((s) => [s.id, s]))
    ;(this.map.getSource(NET) as GeoJSONSource | undefined)?.setData(net)
    ;(this.map.getSource(ST) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: stations.map((s) => ({
        type: 'Feature',
        properties: {
          id: s.id,
          name: s.name,
          glyph: glyphFor(s.mode),
          transfer: !!s.transfer,
          color: s.lines.length > 1 ? this.ink : color.get(s.lines[0]) ?? this.ink,
        },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      })),
    })
  }

  private async maybeLoadBusStops() {
    if (this.busLoaded || this.map.getZoom() < BUS_MIN_ZOOM - 0.5 || !this.map.getSource(BUS)) return
    this.busLoaded = true
    const stops = await loadStops().catch(() => [] as StopRow[])
    const bus = stops.filter((s) => s.mode === 'bus')
    for (const s of bus) this.stations.set(s.id, { ...s, ids: [s.id] })
    ;(this.map.getSource(BUS) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: bus.map((s) => ({ type: 'Feature', properties: { id: s.id }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })),
    })
  }

  /** Emphasise some lines (a line page, or every line of a tapped stop) and fade the rest; null restores the network. */
  setFocus(lines: string[] | null) {
    this.focus = lines && lines.length ? lines : null
    this.applyFocus()
  }

  private applyFocus() {
    const m = this.map
    if (!m.getLayer(NET)) return
    const f = this.focus
    const hit: ExpressionSpecification = ['in', ['get', 'line'], ['literal', f ?? []]]
    if (m.getLayer(BUSNET)) {
      m.setPaintProperty(BUSNET, 'line-opacity', f ? ['case', hit, 1, 0.05] : BUS_OPACITY)
      m.setPaintProperty(BUSNET, 'line-width', f
        ? (['interpolate', ['linear'], ['zoom'], 10, ['case', hit, 4, 0.5], 15, ['case', hit, 7, 1.2]] as ExpressionSpecification)
        : (['interpolate', ['linear'], ['zoom'], 10, 0.5, 15, 1.2] as ExpressionSpecification))
      m.setPaintProperty(BUSNET, 'line-color', f ? ['case', hit, this.accent, this.ink] : this.ink)
    }
    m.setPaintProperty(NET, 'line-opacity', f ? ['case', hit, 1, 0.12] : LINE_OPACITY)
    m.setPaintProperty(NET, 'line-width', f
      ? (['interpolate', ['linear'], ['zoom'], 10, ['case', hit, 5, FERRY, 0.8, 2.5], 15, ['case', hit, 9, FERRY, 2, 6]] as ExpressionSpecification)
      : (LINE_WIDTH as ExpressionSpecification))
  }
}
