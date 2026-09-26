import type { StyleSpecification } from 'maplibre-gl'

// Base map: OpenFreeMap "liberty" (colourful, detailed, shaded relief when zoomed
// out). In dark mode the same style is recoloured into a navy/teal night palette,
// so both themes keep parks, water, roads and places instead of a flat grey map.

const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty'

let cached: Promise<StyleSpecification> | null = null
function loadLiberty(): Promise<StyleSpecification> {
  cached ??= fetch(LIBERTY).then((r) => {
    if (!r.ok) throw new Error(`style HTTP ${r.status}`)
    return r.json() as Promise<StyleSpecification>
  })
  cached.catch(() => (cached = null))
  return cached
}

type Rgba = [number, number, number, number]

let ctx: CanvasRenderingContext2D | null = null
function parse(color: string): Rgba | null {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#010203'
  ctx.fillStyle = color
  const v = String(ctx.fillStyle)
  if (v === '#010203' && color.replace(/\s/g, '') !== '#010203') return null
  if (v.startsWith('#')) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1]
  const m = v.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim())
  return [+r, +g, +b, +a]
}

function toHsl([r, g, b]: Rgba): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

const hsla = (h: number, s: number, l: number, a: number) =>
  `hsla(${h.toFixed(0)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(0)}%,${a})`

/** Map one colour of the light style into the night palette. `role` says how it is used. */
function night(color: string, role: 'area' | 'road' | 'text' | 'halo'): string {
  const c = parse(color)
  if (!c) return color
  let [h, s, l] = toHsl(c)
  const green = h > 55 && h < 170 && s > 0.15
  const water = h > 190 && h < 250 && c[2] > c[0] + 20
  if (role === 'area') {
    // Night palette: navy land, deep blue water, teal-green parks.
    if (water) [h, s, l] = [214, 0.55, 0.13]
    else if (green) [h, s, l] = [168, 0.32, 0.15 + (1 - l) * 0.1]
    else [h, s, l] = [208, 0.3, 0.12 + (1 - l) * 0.22]
  } else if (role === 'road') {
    // Roads in cool blue-greys; big roads (warm colours in the day style) a bit brighter.
    const major = s > 0.4 && h < 60
    ;[h, s, l] = [208, major ? 0.22 : 0.18, major ? 0.3 : 0.2 + l * 0.06]
  } else if (role === 'text') {
    ;[h, s, l] = [205, 0.15, 0.9 - l * 0.3]
  } else {
    ;[h, s, l] = [210, 0.35, 0.1]
  }
  return hsla(h, s, l, c[3])
}

function mapColors(v: unknown, fn: (c: string) => string): unknown {
  if (typeof v === 'string') return parse(v) ? fn(v) : v
  if (Array.isArray(v)) return v.map((x, i) => (i === 0 && typeof x === 'string' && !parse(x) ? x : mapColors(x, fn)))
  return v
}

function nightStyle(style: StyleSpecification): StyleSpecification {
  const s = structuredClone(style)
  for (const layer of s.layers) {
    const paint = (layer as { paint?: Record<string, unknown> }).paint
    if (!paint) continue
    const src = (layer as { 'source-layer'?: string })['source-layer']
    for (const key of Object.keys(paint)) {
      if (!key.endsWith('color')) continue
      const role = key.startsWith('text-halo') || key.startsWith('icon-halo')
        ? 'halo'
        : key.startsWith('text') || key.startsWith('icon')
          ? 'text'
          : layer.type === 'line' && (src === 'transportation' || src === 'aeroway')
            ? 'road'
            : 'area'
      paint[key] = mapColors(paint[key], (c) => night(c, role))
    }
    if (layer.type === 'raster') paint['raster-opacity'] = 0
    if (layer.type === 'fill-extrusion') paint['fill-extrusion-opacity'] = 0.25
  }
  return s
}

export async function baseStyle(scheme: 'light' | 'dark'): Promise<StyleSpecification> {
  const style = await loadLiberty()
  return scheme === 'dark' ? nightStyle(style) : style
}

/** Placeholder until the real style arrives (keeps the page background colour). */
export function blankStyle(scheme: 'light' | 'dark'): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': scheme === 'dark' ? '#15222c' : '#f5f3ef' } }],
  }
}
