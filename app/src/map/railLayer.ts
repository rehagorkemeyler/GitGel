import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import { mapTrips } from '../lib/api'
import { positionAndBearing, prepare, type SimSegment } from '../lib/railsim'

export type TrainInfo = Pick<SimSegment, 'id' | 'line' | 'color' | 'from' | 'to' | 'arr'>

// Scheduled rail positions: hollow rings in the line colour, recomputed a few
// times per second from the timetable. Never labelled live.

const SRC = 'rail-sim'
/** The layer that takes a tap on a scheduled train (MapView keeps empty-map taps apart from it). */
export const RAIL_TAP_LAYERS = ['rail-sim-dots']
// MapLibre zoom (512 px tiles): native zoom 11 is 10 here.
const MIN_ZOOM = 10
const REFRESH_MS = 60_000
const TICK_MS = 1000
/** Native RailLayer MAX_TRAINS: at most this many scheduled trains are drawn. */
const MAX_TRAINS = 120

export class RailLayer {
  private map: MlMap
  private segments: SimSegment[] = []
  private hidden = new Set<string>()
  private only: string | null = null
  private suspended = false
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
    map.on('click', 'rail-sim-dots', click)
    map.on('mouseenter', 'rail-sim-dots', () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', 'rail-sim-dots', () => (map.getCanvas().style.cursor = ''))
  }

  ensure() {
    if (this.map.getSource(SRC)) return
    this.map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    // Hollow ring in the line colour with a compass-style tip pointing where the train goes (native: 24 dp).
    this.map.addLayer({
      id: 'rail-sim-dots',
      type: 'symbol',
      source: SRC,
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': 1,
      },
    })
    this.refresh(true)
  }

  /** While route results are on screen the native map drops its rail layer: no trains are drawn. */
  setSuspended(on: boolean) {
    if (this.suspended === on) return
    this.suspended = on
    if (!on) this.refresh(true)
    this.draw()
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

  /**
   * One small image per line colour, drawn at native size (24 dp box): a solid tip 9 dp wide and 6 dp tall,
   * then a 15 dp ring with a 3.5 dp line-colour border on white.
   */
  private icon(color: string): string {
    const name = `train-${color.replace('#', '')}`
    if (this.map.hasImage(name)) return name
    const ratio = 2
    const size = 24
    const c = document.createElement('canvas')
    c.width = c.height = size * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.beginPath()
    ctx.moveTo(12, 0)
    ctx.lineTo(16.5, 6)
    ctx.lineTo(7.5, 6)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    // Stroke centre radius 5.75 with a 3.5 line gives a 15 dp outer ring.
    ctx.beginPath()
    ctx.arc(12, 14.5, 5.75, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = 3.5
    ctx.strokeStyle = color
    ctx.stroke()
    this.map.addImage(name, ctx.getImageData(0, 0, size * ratio, size * ratio), { pixelRatio: ratio })
    return name
  }

  destroy() {
    clearInterval(this.timer)
    clearInterval(this.refreshTimer)
  }

  private async refresh(force = false) {
    if (document.hidden || this.suspended || !this.map.getSource(SRC)) return
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
      // The server takes native zoom (256 px tiles), one level more than MapLibre's.
      const segs = await mapTrips([b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()], z + 1, new Date(now), new Date(now + REFRESH_MS + 30_000))
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
      if (features.length >= MAX_TRAINS) break
      if (this.suspended) break
      if (seen.has(s.id)) continue
      if (this.only && s.line.toLowerCase() !== this.only.toLowerCase()) continue
      const pos = positionAndBearing(s, now)
      if (!pos) continue
      seen.add(s.id)
      features.push({
        type: 'Feature',
        properties: { id: s.id, color: s.color, line: s.line, bearing: pos.bearing, icon: this.icon(s.color) },
        geometry: { type: 'Point', coordinates: pos.p },
      })
    }
    src.setData({ type: 'FeatureCollection', features })
    this.onCount?.(features.length)
  }
}
