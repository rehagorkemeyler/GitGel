import type { StyleSpecification } from 'maplibre-gl'

// Base map: OpenFreeMap "liberty", recoloured to a flat light and dark palette. Flat land, park, water, road and
// label colours in both themes; buildings blend into the land; no POI, transit or shield icons, no 3D buildings,
// no road casings in dark, and neighbourhood names only when zoomed in.

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

/** Colour roles of the map: each one is one colour per theme. */
export type Role = 'land' | 'park' | 'water' | 'road' | 'arterial' | 'highway' | 'rail' | 'casing' | 'boundary' | 'text' | 'waterText'

type Palette = Record<Role, string | null> & { halo: string }

/** Light: warm grey land, bright green parks, sky-blue water, white roads with a faint casing, dark names. */
export const LIGHT: Palette = {
  land: '#eee6e6',
  park: '#a6e29e',
  water: '#9ad8f8',
  road: '#ffffff',
  arterial: '#ffffff',
  highway: '#ffffff',
  rail: '#cfc8c8',
  casing: '#ddd5d5',
  boundary: '#c9c1c1',
  text: '#1c1c1c',
  waterText: '#3a78b5',
  halo: '#ffffff',
}

/** Dark: slate blue land, deep teal parks, navy water, light slate roads without casings, pale names. */
export const DARK: Palette = {
  land: '#36465a',
  park: '#0a5656',
  water: '#1c3478',
  road: '#526276',
  arterial: '#56667a',
  highway: '#5e6a7a',
  rail: '#4a5a6e',
  casing: null,
  boundary: '#4a5a6e',
  text: '#d6dae2',
  waterText: '#9fb4e0',
  halo: '#36465a',
}

/**
 * Neighbourhood names: shown from zoom 14 only (native administrative.neighborhood is "simplified").
 * OpenMapTiles place classes (openmaptiles layers/place/place.yaml); suburb and borough stay on the zoom-8 layer.
 */
const NEIGHBOURHOOD_CLASSES = ['neighbourhood', 'quarter']
const NEIGHBOURHOOD_MIN_ZOOM = 14

/** Symbol layers that are hidden whole (icons or labels native does not show). */
const HIDDEN_SYMBOL = /^(poi_|highway-name-(minor|path)$|road_one_way|highway-shield|road_shield)/

type AnyLayer = {
  id: string
  type: string
  minzoom?: number
  filter?: unknown
  'source-layer'?: string
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
}

/** The colour role of a liberty fill or line layer, from its id, source layer and type. */
export function roleOf(id: string, type: string, sourceLayer = ''): Role {
  if (type === 'symbol') return 'text'
  if (type === 'fill') {
    if (sourceLayer === 'water') return 'water'
    if (sourceLayer === 'park' || (sourceLayer === 'landcover' && /wood|grass|wetland/.test(id))) return 'park'
    if (sourceLayer === 'building') return 'land'
    return 'land'
  }
  // Lines
  if (sourceLayer === 'boundary') return 'boundary'
  if (sourceLayer === 'waterway') return 'water'
  if (sourceLayer === 'park') return 'park'
  if (/_casing$/.test(id)) return 'casing'
  if (/rail/.test(id)) return 'rail'
  if (/motorway|trunk_primary/.test(id)) return 'highway'
  if (/secondary_tertiary|_link/.test(id)) return 'arterial'
  return 'road'
}

/** A layer with its paint or layout changed for the theme; the names of the symbol layers are kept. */
function restyle(layer: AnyLayer, pal: Palette): AnyLayer[] {
  const paint = (layer.paint ??= {})
  const layout = (layer.layout ??= {})
  const src = layer['source-layer'] ?? ''
  switch (layer.type) {
    case 'background':
      paint['background-color'] = pal.land
      return [layer]
    case 'raster':
      // Shaded relief is not in the native style.
      paint['raster-opacity'] = 0
      return [layer]
    case 'fill-extrusion':
      // Native showsBuildings={false}.
      layout.visibility = 'none'
      return [layer]
    case 'symbol': {
      if (HIDDEN_SYMBOL.test(layer.id) || (!layout['text-field'] && layout['icon-image'])) {
        layout.visibility = 'none'
        return [layer]
      }
      // Place and airport icons go; the names stay.
      delete layout['icon-image']
      const water = src === 'water_name' || layer.id.startsWith('waterway_')
      paint['text-color'] = water ? pal.waterText : pal.text
      if ('text-halo-color' in paint) paint['text-halo-color'] = pal.halo
      return [layer]
    }
    case 'fill': {
      // Pattern-only areas (pedestrian zones) have no native counterpart.
      if ('fill-pattern' in paint && !('fill-color' in paint)) {
        layout.visibility = 'none'
        return [layer]
      }
      const role = roleOf(layer.id, 'fill', src)
      const color = pal[role] ?? pal.land
      paint['fill-color'] = color
      paint['fill-outline-color'] = color
      // Parks are solid (liberty fades them).
      if (role === 'park') paint['fill-opacity'] = 1
      return [layer]
    }
    case 'line': {
      const role = roleOf(layer.id, 'line', src)
      if (role === 'casing' && pal.casing === null) {
        layout.visibility = 'none'
        return [layer]
      }
      paint['line-color'] = pal[role] ?? pal.road
      return [layer]
    }
    default:
      return [layer]
  }
}

/**
 * Recolour a liberty style for the theme. Returns a new style; the input is not changed.
 * Exported for tests.
 */
export function recolour(style: StyleSpecification, scheme: 'light' | 'dark'): StyleSpecification {
  const pal = scheme === 'dark' ? DARK : LIGHT
  const s = structuredClone(style)
  const out: AnyLayer[] = []
  for (const layer of s.layers as unknown as AnyLayer[]) {
    if (layer.id === 'label_other') {
      // The rest of the place names keep their zoom; neighbourhoods appear later.
      const base = layer.filter
      const neighbourhood = ['match', ['get', 'class'], NEIGHBOURHOOD_CLASSES, true, false]
      const named = structuredClone(layer)
      out.push(...restyle(layer, pal))
      out.push(...restyle(named, pal).map((l) => ({ ...l, id: 'label_neighbourhood', minzoom: NEIGHBOURHOOD_MIN_ZOOM, filter: ['all', base, neighbourhood] })))
      layer.filter = ['all', base, ['!', neighbourhood]]
      continue
    }
    out.push(...restyle(layer, pal))
  }
  s.layers = out as unknown as StyleSpecification['layers']
  return s
}

export async function baseStyle(scheme: 'light' | 'dark'): Promise<StyleSpecification> {
  return recolour(await loadLiberty(), scheme)
}

/** Placeholder until the real style arrives (keeps the page background colour). */
export function blankStyle(scheme: 'light' | 'dark'): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': (scheme === 'dark' ? DARK : LIGHT).land as string } }],
  }
}
