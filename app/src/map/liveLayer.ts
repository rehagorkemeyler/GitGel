import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import type { Vehicle } from '../lib/live'
import { loadLines, type Line } from '../lib/data'
import { ACCENT, LIVE_COLOR } from '../lib/colors'
import type { Scheme } from '../lib/useColorScheme'
import { busGlyph } from './icons'

// Live buses (every city): a round marker in the line's colour with a white bus glyph, ringed in the
// live green, and the line code in a small pill under it. Drawn at each fix (no glide between fixes).
// Marker: 30 px across (3 px live ring around a 24 px disc). Pill: 18 px tall, from zoom 12 up.

const SRC = 'live-vehicles'
/** The layer that takes a tap on a live bus (MapView drops the bus bubble on any other tap). */
export const LIVE_TAP_LAYER = 'live-dots'
const LABEL_LAYER = 'live-labels'
/** Every layer of a live bus (marker and line pill); a tap on any of them opens its bubble. */
export const LIVE_TAP_LAYERS = [LIVE_TAP_LAYER, LABEL_LAYER]
const RATIO = 2
export const MARKER_SIZE = 30
const PILL_H = 18

/** A tap on the open bus bubble (a DOM marker over the map) is not a tap on the map beneath it. */
export function fromBubble(e: Pick<MapMouseEvent, 'originalEvent'>): boolean {
  return !!(e.originalEvent?.target as Element | null | undefined)?.closest?.('.bus-bubble')
}

/** Lines by short name, a bus line first when a rail line shares the name (as the bus bubble picks). */
export function busLinesByName(lines: Line[]): Map<string, Line> {
  const m = new Map<string, Line>()
  for (const l of lines) {
    const cur = m.get(l.name)
    if (!cur || (cur.mode !== 'bus' && l.mode === 'bus')) m.set(l.name, l)
  }
  return m
}

/** '#rrggbb' for a GTFS colour ('rrggbb' or ''), the accent when the line has none. */
export function hexOf(color: string | undefined | null): string {
  return color && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toLowerCase()}` : ACCENT
}

/** Text colour for the pill: the line colour, or near-black when that colour is too pale on white. */
export function pillText(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.72 ? '#1c1c1e' : hex
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * RATIO)
  c.height = Math.ceil(h * RATIO)
  const ctx = c.getContext('2d')!
  ctx.scale(RATIO, RATIO)
  return ctx
}

function drawMarker(fill: string, ring: string): ImageData {
  const s = MARKER_SIZE
  const ctx = canvas(s, s)
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2)
  ctx.fillStyle = ring
  ctx.fill()
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  const g = 15
  ctx.translate((s - g) / 2, (s - g) / 2)
  ctx.scale(g / 24, g / 24)
  ctx.fillStyle = '#ffffff'
  ctx.fill(new Path2D(busGlyph()))
  return ctx.getImageData(0, 0, s * RATIO, s * RATIO)
}

const FONT = `700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

function drawPill(text: string, color: string, ring: string): { data: ImageData; width: number } {
  const probe = canvas(1, 1)
  probe.font = FONT
  const w = Math.ceil(probe.measureText(text).width) + 14
  const ctx = canvas(w, PILL_H)
  ctx.beginPath()
  ctx.roundRect(0.75, 0.75, w - 1.5, PILL_H - 1.5, (PILL_H - 1.5) / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = ring
  ctx.stroke()
  ctx.font = FONT
  ctx.fillStyle = pillText(color)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, PILL_H / 2 + 0.5)
  return { data: ctx.getImageData(0, 0, Math.ceil(w * RATIO), PILL_H * RATIO), width: w }
}

export class LiveLayer {
  private map: MlMap
  private list: Vehicle[] = []
  private byId = new Map<string, Vehicle>()
  private lines = new Map<string, Line>()
  private scheme: Scheme = 'light'
  onVehicle?: (v: Vehicle) => void

  constructor(map: MlMap) {
    this.map = map
    for (const layer of LIVE_TAP_LAYERS) {
      map.on('click', layer, (e) => {
        if (fromBubble(e)) return
        const v = this.byId.get(String(e.features?.[0]?.properties?.id))
        if (v) this.onVehicle?.(v)
      })
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }
    loadLines().then(
      (ls) => {
        this.lines = busLinesByName(ls)
        this.draw()
      },
      () => {},
    )
  }

  /** Adds the source and layers; called again on every style.load with the current scheme. */
  ensure(scheme: Scheme) {
    if (this.map.getSource(SRC)) return
    this.scheme = scheme
    this.map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    this.map.addLayer({
      id: LABEL_LAYER,
      type: 'symbol',
      source: SRC,
      minzoom: 12,
      layout: {
        'icon-image': ['get', 'label'],
        'icon-anchor': 'top',
        'icon-offset': [0, MARKER_SIZE / 2 + 1],
        'icon-allow-overlap': false,
        'icon-padding': 1,
      },
    })
    this.map.addLayer({
      id: LIVE_TAP_LAYER,
      type: 'symbol',
      source: SRC,
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // Smaller when zoomed out, so a busy line does not turn into one blob.
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.55, 13, 1],
      },
    })
    this.draw()
  }

  update(vehicles: Vehicle[]) {
    this.list = vehicles
    this.byId = new Map(vehicles.map((v) => [v.id, v]))
    this.draw()
  }

  private image(name: string, make: () => { data: ImageData }) {
    if (!this.map.hasImage(name)) this.map.addImage(name, make().data, { pixelRatio: RATIO })
  }

  private draw() {
    const src = this.map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    const ring = LIVE_COLOR[this.scheme]
    const features: GeoJSON.Feature[] = this.list.map((v) => {
      const color = hexOf(this.lines.get(v.line)?.color)
      const icon = `gg-veh-${color}-${this.scheme}`
      const label = `gg-vehl-${v.line}-${color}-${this.scheme}`
      this.image(icon, () => ({ data: drawMarker(color, ring) }))
      if (v.line) this.image(label, () => drawPill(v.line, color, ring))
      return {
        type: 'Feature',
        properties: { id: v.id, icon, label: v.line ? label : '' },
        geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      }
    })
    src.setData({ type: 'FeatureCollection', features })
  }
}
