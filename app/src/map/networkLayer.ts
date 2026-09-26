import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import { loadJson, loadStops, type StopRow } from '../lib/data'

// Base transit layer, like Google Maps: rail/tram/funicular/cable car/ferry lines
// in their official colours, station markers, and bus stops when zoomed in.

export type Station = { id: string; ids: string[]; name: string; lat: number; lon: number; mode: string; lines: string[] }

const NET = 'net-lines'
const ST = 'net-stations'
const BUS = 'net-bus-stops'
const BUS_MIN_ZOOM = 15

function firstSymbolLayer(map: MlMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
}

export class NetworkLayer {
  private map: MlMap
  private focus: string | null = null
  private busLoaded = false
  onStation?: (s: Station) => void
  private stations = new Map<string, Station>()
  private ink = '#3a3a3c'

  constructor(map: MlMap) {
    this.map = map
    const click = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      const s = f && this.stations.get(String(f.properties?.id))
      if (s) this.onStation?.(s)
    }
    map.on('click', ST + '-dot', click)
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
    const before = firstSymbolLayer(m)
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    const ink = dark ? '#e5e5ea' : '#3a3a3c'
    const paper = dark ? '#1c1c1e' : '#ffffff'
    m.addSource(NET, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addSource(ST, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addSource(BUS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addLayer(
      {
        id: NET + '-casing',
        type: 'line',
        source: NET,
        filter: ['!=', ['get', 'mode'], 'ferry'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': paper, 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 7] },
      },
      before,
    )
    m.addLayer(
      {
        id: NET,
        type: 'line',
        source: NET,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 4.5],
          'line-dasharray': ['case', ['==', ['get', 'mode'], 'ferry'], ['literal', [2, 2]], ['literal', [1, 0]]],
          // Ferry hops fade in with zoom so the Bosphorus is not a web of lines.
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, ['case', ['==', ['get', 'mode'], 'ferry'], 0.12, 1], 14, ['case', ['==', ['get', 'mode'], 'ferry'], 0.45, 1]],
        },
      },
      before,
    )
    m.addLayer({
      id: BUS + '-dot',
      type: 'circle',
      source: BUS,
      minzoom: BUS_MIN_ZOOM,
      paint: { 'circle-radius': 4, 'circle-color': paper, 'circle-stroke-color': dark ? '#aeaeb2' : '#5f5f66', 'circle-stroke-width': 1.5 },
    })
    m.addLayer({
      id: ST + '-dot',
      type: 'circle',
      source: ST,
      minzoom: 10.5,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 15, 5],
        'circle-color': paper,
        'circle-stroke-color': ink,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 1.5],
      },
    })
    m.addLayer({
      id: ST + '-label',
      type: 'symbol',
      source: ST,
      minzoom: 13,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-optional': true,
        'text-font': ['Noto Sans Regular'],
      },
      paint: { 'text-color': ink, 'text-halo-color': paper, 'text-halo-width': 1.5 },
    })
    this.ink = ink
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
    const color = new Map(lines.map((l) => [l.id, l.color ? `#${l.color}` : '#3a3a3c']))
    this.stations = new Map(stations.map((s) => [s.id, s]))
    ;(this.map.getSource(NET) as GeoJSONSource | undefined)?.setData(net)
    ;(this.map.getSource(ST) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: stations.map((s) => ({
        type: 'Feature',
        properties: { id: s.id, name: s.name, color: s.lines.length > 1 ? this.ink : color.get(s.lines[0]) ?? this.ink },
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

  /** Emphasise one line (line page) and fade the rest; null restores the network. */
  setFocus(line: string | null) {
    this.focus = line
    this.applyFocus()
  }

  private applyFocus() {
    const m = this.map
    if (!m.getLayer(NET)) return
    const f = this.focus
    m.setPaintProperty(NET, 'line-opacity', f ? ['case', ['==', ['get', 'line'], f], 1, 0.12] : ['interpolate', ['linear'], ['zoom'], 11, ['case', ['==', ['get', 'mode'], 'ferry'], 0.12, 1], 14, ['case', ['==', ['get', 'mode'], 'ferry'], 0.45, 1]])
    const on: ExpressionSpecification = ['==', ['get', 'line'], f ?? '']
    m.setPaintProperty(NET, 'line-width', f
      ? (['interpolate', ['linear'], ['zoom'], 10, ['case', on, 4, 1.5], 15, ['case', on, 7, 4.5]] as ExpressionSpecification)
      : (['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 4.5] as ExpressionSpecification))
  }
}
