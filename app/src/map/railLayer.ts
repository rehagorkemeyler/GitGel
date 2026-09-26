import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import { mapTrips } from '../lib/api'
import { positionAt, prepare, type SimSegment } from '../lib/railsim'

export type TrainInfo = Pick<SimSegment, 'id' | 'line' | 'color' | 'from' | 'to' | 'arr'>

// Scheduled rail positions: hollow rings in the line colour, recomputed a few
// times per second from the timetable. Never labelled live.

const SRC = 'rail-sim'
const MIN_ZOOM = 11
const REFRESH_MS = 60_000
const TICK_MS = 500

export class RailLayer {
  private map: MlMap
  private segments: SimSegment[] = []
  private hidden = new Set<string>()
  private only: string | null = null
  private fetchedFor = ''
  private timer = 0
  private refreshTimer = 0
  onCount?: (n: number) => void
  onTrain?: (t: TrainInfo) => void

  constructor(map: MlMap) {
    this.map = map
    map.on('moveend', () => this.refresh())
    this.refreshTimer = window.setInterval(() => this.refresh(true), REFRESH_MS)
    this.timer = window.setInterval(() => this.draw(), TICK_MS)
    document.addEventListener('visibilitychange', () => !document.hidden && this.refresh(true))
    const click = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      const id = String(e.features?.[0]?.properties?.id ?? '')
      const now = Date.now()
      const s = this.segments.find((x) => x.id === id && x.dep <= now && now <= x.arr) ?? this.segments.find((x) => x.id === id)
      if (s) this.onTrain?.({ id: s.id, line: s.line, color: s.color, from: s.from, to: s.to, arr: s.arr })
    }
    map.on('click', 'rail-sim-halo', click)
    map.on('mouseenter', 'rail-sim-halo', () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', 'rail-sim-halo', () => (map.getCanvas().style.cursor = ''))
  }

  ensure() {
    if (this.map.getSource(SRC)) return
    this.map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    // White halo under the ring so a train never looks like a station marker.
    this.map.addLayer({
      id: 'rail-sim-halo',
      type: 'circle',
      source: SRC,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 14, 10], 'circle-color': '#ffffff', 'circle-opacity': 0.9, 'circle-blur': 0.2 },
    })
    this.map.addLayer({
      id: 'rail-sim-dots',
      type: 'circle',
      source: SRC,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 14, 6.5],
        'circle-color': '#ffffff',
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 14, 3.5],
      },
    })
    this.refresh(true)
  }

  /** Lines with a reported service problem: their scheduled dots are hidden. */
  setHidden(lines: string[]) {
    this.hidden = new Set(lines)
    this.segments = this.segments.filter((s) => !this.hidden.has(s.line))
    this.draw()
  }

  /** Line page open: show only that line's trains (by line id or short name). */
  setOnly(line: string | null) {
    this.only = line
    this.draw()
  }

  destroy() {
    clearInterval(this.timer)
    clearInterval(this.refreshTimer)
  }

  private async refresh(force = false) {
    if (document.hidden || !this.map.getSource(SRC)) return
    const z = this.map.getZoom()
    if (z < MIN_ZOOM) {
      this.segments = []
      this.draw()
      return
    }
    const b = this.map.getBounds()
    const key = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(2)).join(',') + `@${Math.round(z)}`
    if (!force && key === this.fetchedFor) return
    this.fetchedFor = key
    const now = Date.now()
    try {
      const segs = await mapTrips([b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()], z, new Date(now), new Date(now + REFRESH_MS + 30_000))
      this.segments = prepare(segs, this.hidden)
      this.draw()
    } catch {
      // Routing server unreachable: keep what we have; dots simply run out.
    }
  }

  private draw() {
    const src = this.map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    const now = Date.now()
    const seen = new Set<string>()
    const features: GeoJSON.Feature[] = []
    for (const s of this.segments) {
      if (seen.has(s.id)) continue
      if (this.only && s.line.toLowerCase() !== this.only.toLowerCase()) continue
      const p = positionAt(s, now)
      if (!p) continue
      seen.add(s.id)
      features.push({ type: 'Feature', properties: { id: s.id, color: s.color, line: s.line }, geometry: { type: 'Point', coordinates: p } })
    }
    src.setData({ type: 'FeatureCollection', features })
    this.onCount?.(features.length)
  }
}
