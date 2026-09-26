import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import type { Vehicle } from '../lib/live'

// Live vehicles: filled dots. Between two GPS fixes a dot glides to its new
// position (only the map's own GPU drawing changes, no layout work).

const SRC = 'live-vehicles'
const GLIDE_MS = 1200

type Pos = { lon: number; lat: number }

export class LiveLayer {
  private map: MlMap
  private from = new Map<string, Pos>()
  private to = new Map<string, Pos>()
  private color = '#1a7f37'
  private start = 0
  private frame = 0
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(map: MlMap) {
    this.map = map
  }

  ensure() {
    if (this.map.getSource(SRC)) return
    this.map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    this.map.addLayer({
      id: 'live-dots',
      type: 'circle',
      source: SRC,
      paint: {
        'circle-radius': 7,
        'circle-color': this.color,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
    this.draw(1)
  }

  update(vehicles: Vehicle[]) {
    const current = this.positions(this.progress())
    this.from = current
    this.to = new Map(vehicles.map((v) => [v.id, { lon: v.lon, lat: v.lat }]))
    for (const [id, p] of this.to) if (!this.from.has(id)) this.from.set(id, p)
    this.start = performance.now()
    cancelAnimationFrame(this.frame)
    this.tick()
  }

  private progress() {
    if (this.reduce) return 1
    return Math.min(1, (performance.now() - this.start) / GLIDE_MS)
  }

  private positions(t: number) {
    const out = new Map<string, Pos>()
    for (const [id, b] of this.to) {
      const a = this.from.get(id) ?? b
      out.set(id, { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t })
    }
    return out
  }

  private tick = () => {
    const t = this.progress()
    this.draw(t)
    if (t < 1) this.frame = requestAnimationFrame(this.tick)
  }

  private draw(t: number) {
    const src = this.map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    const features: GeoJSON.Feature[] = [...this.positions(t)].map(([id, p]) => ({
      type: 'Feature',
      properties: { id },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    }))
    src.setData({ type: 'FeatureCollection', features })
  }
}
