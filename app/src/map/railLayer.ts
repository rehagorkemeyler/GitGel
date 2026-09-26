import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import { mapTrips } from '../lib/api'
import { positionAt, prepare, type SimSegment } from '../lib/railsim'

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
  private fetchedFor = ''
  private timer = 0
  private refreshTimer = 0
  onCount?: (n: number) => void

  constructor(map: MlMap) {
    this.map = map
    map.on('moveend', () => this.refresh())
    this.refreshTimer = window.setInterval(() => this.refresh(true), REFRESH_MS)
    this.timer = window.setInterval(() => this.draw(), TICK_MS)
    document.addEventListener('visibilitychange', () => !document.hidden && this.refresh(true))
  }

  ensure() {
    if (this.map.getSource(SRC)) return
    this.map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    this.map.addLayer({
      id: 'rail-sim-dots',
      type: 'circle',
      source: SRC,
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 3,
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
      const p = positionAt(s, now)
      if (!p) continue
      seen.add(s.id)
      features.push({ type: 'Feature', properties: { color: s.color, line: s.line }, geometry: { type: 'Point', coordinates: p } })
    }
    src.setData({ type: 'FeatureCollection', features })
    this.onCount?.(features.length)
  }
}
