import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import { loadJson, loadStops, type StopRow } from '../lib/data'
import { addTransitIcons, glyphFor } from './icons'
import { busShapes } from '../lib/city'
import { ACCENT } from '../lib/colors'
import { visibleNearest, type View } from '../lib/nearest'

// Base transit layer, like Google Maps: rail/tram/funicular/cable car/ferry lines
// in their official colours, station markers, and bus stops when zoomed in.
// Zoom numbers here are MapLibre's (512 px tiles): native zoom minus 1. Sizes are native dp, 1:1 px.

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
const NET_CASING = NET + '-casing'
// Ankara and Bursa: each bus route has a real shape, drawn only while its line is focused.
const BUSNET = 'net-bus-lines'
const BUSNET_CASING = BUSNET + '-casing'
// Istanbul bus and ferry lines of a tapped stop, drawn stop to stop (native FocusLayer).
const FOCUS = 'net-focus'
const FOCUS_CASING = FOCUS + '-casing'
const ST = 'net-stations'
const BUS = 'net-bus-stops'
const BUS_SEL = BUS + '-sel'
const BUS_CLUSTER = BUS + '-cluster'
/**
 * Bus stops closer than this (px) merge into one bubble with their count; zooming in splits them. At least
 * the largest bubble (36 px) plus a clear gap, so bubbles never crowd each other either. Stops at the very same pole stay
 * merged up to CLUSTER_MAX_ZOOM, where they could not be told apart anyway.
 */
const CLUSTER_RADIUS = 48
const CLUSTER_MAX_ZOOM = 20

/** Lines under a focus or a route: native 0x33 alpha (0.2). */
const FADED = 0.2
/** Native line widths: 4 dp, 6 dp when focused, and a 7 dp paper casing. */
const LINE_W = 4
const FOCUS_W = 6
const CASING_W = 7
/**
 * Native ferry dash is [8, 8] dp. MapLibre scales dash lengths by the line width, and a ferry is drawn
 * only while its line is in focus (native does the same), so it is always FOCUS_W wide: 8 / 6 gives 8 px dashes.
 */
const FERRY_DASH = 8 / FOCUS_W
const NOT_FERRY: ExpressionSpecification = ['!=', ['get', 'mode'], 'ferry']
/** Native StopMarkers: stations as dots from zoom 10 and as tiles from 12.5; bus stops from 16 (data from 15.5). */
const ST_DOT_MIN = 9
const ST_DOT_MAX = 11.5
const ST_ICON_MIN = 11.5
/** Native switches the tile size from 16 to 20 dp at zoom 15. */
const ST_TILE_STEP = 14
const BUS_MIN_ZOOM = 15
const MAX_MARKERS = 150
/** Bus stops: more, as clusters keep a dense centre readable. */
const MAX_BUS_MARKERS = 300
/** Layers that take a tap on a station or a bus stop (MapView keeps empty-map taps apart from them). */
export const NET_TAP_LAYERS = [ST + '-dot', ST + '-far', BUS + '-dot', BUS_SEL, BUS_CLUSTER]

type Placed = { lat: number; lon: number; feature: GeoJSON.Feature }

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Lines drawn in focus (or none). Ferries only while one of their lines is in focus (native). */
function netFilter(focus: string[] | null): FilterSpecification {
  return focus ? ['any', NOT_FERRY, ['in', ['get', 'line'], ['literal', focus]]] : NOT_FERRY
}

export class NetworkLayer {
  private map: MlMap
  private focus: string[] | null = null
  private dim = false
  private selected: string | null = null
  private busPaths: [number, number][][] = []
  private busLoaded = false
  onStation?: (s: Station) => void
  /** Tap on a bus stop cluster: its stops, and the bubble's point. */
  onCluster?: (stops: Station[], at: { lat: number; lon: number }) => void
  private stations = new Map<string, Station>()
  private stationRows: Placed[] = []
  private busRows: Placed[] = []
  private ink = '#3a3a3c'

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
    map.on('click', BUS_SEL, click)
    map.on('click', BUS_CLUSTER, (e) => {
      const f = e.features?.[0]
      const id = f?.properties?.cluster_id
      const src = map.getSource(BUS) as GeoJSONSource | undefined
      if (!src || !f || typeof id !== 'number' || f.geometry.type !== 'Point') return
      const [lon, lat] = f.geometry.coordinates
      src.getClusterLeaves(id, Infinity, 0).then(
        (leaves) => {
          const stops = leaves.map((l) => this.stations.get(String(l.properties?.id))).filter((x): x is Station => !!x)
          if (stops.length) this.onCluster?.(stops, { lat, lon })
        },
        () => {},
      )
    })
    for (const id of [ST + '-dot', BUS + '-dot', BUS_SEL, BUS_CLUSTER]) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
    }
    map.on('zoomend', () => this.maybeLoadBusStops())
    map.on('moveend', () => this.showNearest())
  }

  /** (Re)add sources and layers; call after every style load. */
  async ensure() {
    const m = this.map
    if (m.getSource(NET)) return
    // Transit lines sit on top of every base-map layer (roads included), under our own markers.
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    const ink = dark ? '#e5e5ea' : '#3a3a3c'
    // Native dark paper is #1c1e24 (StopMarkers, NetworkLayer): casings, station fill and label halo.
    const paper = dark ? '#1c1e24' : '#ffffff'
    this.ink = ink
    addTransitIcons(m, dark)
    for (const id of [NET, ST, FOCUS, BUS_SEL]) m.addSource(id, { type: 'geojson', data: EMPTY })
    m.addSource(BUS, { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: CLUSTER_MAX_ZOOM, maxzoom: CLUSTER_MAX_ZOOM + 1 })
    const round = { 'line-cap': 'round', 'line-join': 'round' } as const
    if (busShapes()) {
      m.addSource(BUSNET, { type: 'geojson', data: EMPTY })
      // White casing as native FocusLayer (not the paper colour, which is dark in dark mode).
      m.addLayer({ id: BUSNET_CASING, type: 'line', source: BUSNET, layout: round, paint: { 'line-color': '#ffffff', 'line-width': CASING_W } })
      m.addLayer({ id: BUSNET, type: 'line', source: BUSNET, layout: round, paint: { 'line-color': ACCENT, 'line-width': LINE_W } })
    }
    m.addLayer({ id: NET_CASING, type: 'line', source: NET, filter: NOT_FERRY, layout: round, paint: { 'line-color': paper, 'line-width': CASING_W } })
    m.addLayer({
      id: NET,
      type: 'line',
      source: NET,
      filter: netFilter(null),
      layout: round,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': LINE_W,
        // Ferries are dashed (native [8, 8] dp, see FERRY_DASH).
        'line-dasharray': ['case', ['==', ['get', 'mode'], 'ferry'], ['literal', [FERRY_DASH, FERRY_DASH]], ['literal', [1, 0]]],
      },
    })
    m.addLayer({ id: FOCUS_CASING, type: 'line', source: FOCUS, layout: round, paint: { 'line-color': '#ffffff', 'line-width': CASING_W } })
    m.addLayer({ id: FOCUS, type: 'line', source: FOCUS, layout: round, paint: { 'line-color': ACCENT, 'line-width': LINE_W } })
    m.addLayer({
      id: BUS + '-dot',
      type: 'symbol',
      source: BUS,
      minzoom: BUS_MIN_ZOOM,
      filter: ['!', ['has', 'point_count']],
      layout: { 'icon-image': 'gg-busstop', 'icon-size': 1, 'icon-allow-overlap': true },
    })
    // Stops that would touch: one bubble with their count. A symbol (not a circle), so it fades in and out
    // with the stops as the clusters split and merge.
    m.addLayer({
      id: BUS_CLUSTER,
      type: 'symbol',
      source: BUS,
      minzoom: BUS_MIN_ZOOM,
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': ['step', ['get', 'point_count'], 'gg-cluster-s', 10, 'gg-cluster-m', 50, 'gg-cluster-l'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['to-string', ['get', 'point_count']],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['step', ['get', 'point_count'], 13, 10, 13.5, 50, 14],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'symbol-sort-key': ['get', 'point_count'],
      },
      paint: { 'text-color': dark ? '#f5f5f7' : '#1c1c1e' },
    })
    // The selected bus stop (26 px accent tile), above the other bus stops and clusters: its own source, so a
    // cluster never swallows the stop of the open card.
    m.addLayer({
      id: BUS_SEL,
      type: 'symbol',
      source: BUS_SEL,
      minzoom: BUS_MIN_ZOOM,
      layout: { 'icon-image': 'gg-busstop-sel', 'icon-size': 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    })
    // Far away: small dots on the line (native: 8 px, transfer 12 px, outer size; the stroke sits outside the radius).
    // Closer: mode icons (train, tram, ferry...).
    m.addLayer({
      id: ST + '-far',
      type: 'circle',
      source: ST,
      minzoom: ST_DOT_MIN,
      maxzoom: ST_DOT_MAX,
      paint: {
        'circle-radius': ['case', ['get', 'transfer'], 4, 2.5],
        'circle-color': paper,
        'circle-stroke-color': ink,
        'circle-stroke-width': ['case', ['get', 'transfer'], 2, 1.5],
      },
    })
    m.addLayer({
      id: ST + '-dot',
      type: 'symbol',
      source: ST,
      minzoom: ST_ICON_MIN,
      layout: {
        'icon-image': ['concat', 'gg-', ['get', 'glyph']],
        // The glyph image is 22 px. Native: 16 px below zoom 15, 20 px from 15; transfers 1.3x (21 and 26 px).
        'icon-size': ['step', ['zoom'], ['case', ['get', 'transfer'], 0.9545, 0.7273], ST_TILE_STEP, ['case', ['get', 'transfer'], 1.1818, 0.9091]],
        // Higher keys draw later, on top: transfers over normal stations (native zIndex 5 over 4).
        'symbol-sort-key': ['case', ['get', 'transfer'], 1, 0],
        'icon-allow-overlap': true,
      },
    })
    await this.load()
    this.applyFocus()
    this.applySelected()
    this.applyBusPaths()
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
    this.stationRows = stations.map((s) => ({
      lat: s.lat,
      lon: s.lon,
      feature: {
        type: 'Feature',
        properties: {
          id: s.id,
          name: s.name,
          glyph: glyphFor(s.mode),
          transfer: !!s.transfer,
          color: s.lines.length > 1 ? this.ink : color.get(s.lines[0]) ?? this.ink,
        },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      },
    }))
    this.showNearest()
  }

  private async maybeLoadBusStops() {
    if (this.busLoaded || this.map.getZoom() < BUS_MIN_ZOOM - 0.5 || !this.map.getSource(BUS)) return
    this.busLoaded = true
    const stops = await loadStops().catch(() => [] as StopRow[])
    const bus = stops.filter((s) => s.mode === 'bus')
    for (const s of bus) this.stations.set(s.id, { ...s, ids: [s.id] })
    this.applySelected()
    this.busRows = bus.map((s) => ({
      lat: s.lat,
      lon: s.lon,
      feature: { type: 'Feature', properties: { id: s.id }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } },
    }))
    this.showNearest()
  }

  /** The stations and bus stops in view, nearest the centre first, at most 150 of each (native StopMarkers). */
  private showNearest() {
    const m = this.map
    const c = m.getCenter()
    const b = m.getBounds()
    const view: View = { lat: c.lat, lon: c.lng, latDelta: b.getNorth() - b.getSouth(), lonDelta: b.getEast() - b.getWest() }
    const put = (id: string, rows: Placed[]) =>
      (m.getSource(id) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: visibleNearest(rows, view, id === BUS ? MAX_BUS_MARKERS : MAX_MARKERS).map((r) => r.feature),
      })
    put(ST, this.stationRows)
    put(BUS, this.busRows)
  }

  /** Emphasise some lines (a line page, or every line of a tapped stop) and fade the rest; null restores the network. */
  setFocus(lines: string[] | null) {
    this.focus = lines && lines.length ? lines : null
    this.applyFocus()
  }

  /** Route results on screen: every line fades, with no casing, and the focus is cleared (native dim). */
  setDim(dim: boolean) {
    this.dim = dim
    this.applyFocus()
    this.applyBusPaths()
  }

  /** The bus stop of the open station card: drawn as a 26 px accent tile. */
  setSelected(id: string | null) {
    this.selected = id
    this.applySelected()
  }

  /** Stop-to-stop paths of the tapped stop's bus and ferry lines (Istanbul). */
  setBusPaths(paths: [number, number][][]) {
    this.busPaths = paths
    this.applyBusPaths()
  }

  private applyFocus() {
    const m = this.map
    if (!m.getLayer(NET)) return
    const f = this.dim ? null : this.focus
    const hit: ExpressionSpecification | null = f ? ['in', ['get', 'line'], ['literal', f]] : null
    m.setFilter(NET, netFilter(f))
    m.setPaintProperty(NET, 'line-opacity', this.dim ? FADED : hit ? ['case', hit, 1, FADED] : 1)
    m.setPaintProperty(NET, 'line-width', hit ? ['case', hit, FOCUS_W, LINE_W] : LINE_W)
    m.setPaintProperty(NET_CASING, 'line-opacity', this.dim ? 0 : hit ? ['case', hit, 1, 0] : 1)
    if (m.getLayer(BUSNET)) {
      m.setPaintProperty(BUSNET, 'line-opacity', hit ? ['case', hit, 1, 0] : 0)
      m.setPaintProperty(BUSNET_CASING, 'line-opacity', hit ? ['case', hit, 1, 0] : 0)
    }
  }

  private applySelected() {
    const src = this.map.getSource(BUS_SEL) as GeoJSONSource | undefined
    const s = this.selected ? this.stations.get(this.selected) : undefined
    src?.setData({
      type: 'FeatureCollection',
      features: s && s.mode === 'bus' ? [{ type: 'Feature', properties: { id: s.id }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } }] : [],
    })
  }

  private applyBusPaths() {
    const src = this.map.getSource(FOCUS) as GeoJSONSource | undefined
    src?.setData({
      type: 'FeatureCollection',
      features: (this.dim ? [] : this.busPaths).map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      })),
    })
  }
}
