import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { DARK, LIGHT, recolour, roleOf } from './baseStyle'

type L = { id: string; type: string; layout?: Record<string, unknown>; paint?: Record<string, unknown>; minzoom?: number; filter?: unknown; 'source-layer'?: string }

function style(layers: L[]): StyleSpecification {
  return { version: 8, sources: {}, layers } as unknown as StyleSpecification
}
const find = (s: StyleSpecification, id: string) => (s.layers as unknown as L[]).find((l) => l.id === id)!

describe('roleOf', () => {
  it('classifies roads by class and casings by id', () => {
    expect(roleOf('road_motorway', 'line', 'transportation')).toBe('highway')
    expect(roleOf('road_trunk_primary', 'line', 'transportation')).toBe('highway')
    expect(roleOf('road_secondary_tertiary', 'line', 'transportation')).toBe('arterial')
    expect(roleOf('road_minor', 'line', 'transportation')).toBe('road')
    expect(roleOf('road_motorway_link_casing', 'line', 'transportation')).toBe('casing')
    expect(roleOf('bridge_street_casing', 'line', 'transportation')).toBe('casing')
  })

  it('classifies water, parks, rail and boundaries', () => {
    expect(roleOf('water', 'fill', 'water')).toBe('water')
    expect(roleOf('landcover_wood', 'fill', 'landcover')).toBe('park')
    expect(roleOf('landuse_residential', 'fill', 'landuse')).toBe('land')
    expect(roleOf('road_major_rail', 'line', 'transportation')).toBe('rail')
    expect(roleOf('boundary_2', 'line', 'boundary')).toBe('boundary')
  })
})

describe('recolour', () => {
  it('uses the native light and dark colours', () => {
    const base = style([{ id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } }, { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': 'rgb(158,189,255)' } }])
    expect(find(recolour(base, 'light'), 'water').paint!['fill-color']).toBe(LIGHT.water)
    expect(find(recolour(base, 'dark'), 'water').paint!['fill-color']).toBe(DARK.water)
    expect(find(recolour(base, 'dark'), 'background').paint!['background-color']).toBe(DARK.land)
  })

  it('hides casings in dark only', () => {
    const base = style([{ id: 'road_minor_casing', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': '#cfcdca' } }])
    expect(find(recolour(base, 'light'), 'road_minor_casing').paint!['line-color']).toBe(LIGHT.casing)
    expect(find(recolour(base, 'dark'), 'road_minor_casing').layout?.visibility).toBe('none')
  })

  it('hides POI, transit and minor road name layers, and removes icons from place names', () => {
    const base = style([
      { id: 'poi_r7', type: 'symbol', 'source-layer': 'poi', layout: { 'icon-image': 'x', 'text-field': 'a' } },
      { id: 'highway-name-minor', type: 'symbol', layout: { 'text-field': 'a' } },
      { id: 'highway-name-major', type: 'symbol', layout: { 'text-field': 'a' } },
      { id: 'highway-shield-non-us', type: 'symbol', layout: { 'icon-image': 'road_1', 'text-field': 'a' } },
      { id: 'road_one_way_arrow', type: 'symbol', layout: { 'icon-image': 'arrow' } },
      { id: 'label_city', type: 'symbol', layout: { 'icon-image': 'circle', 'text-field': 'a' }, paint: { 'text-color': '#000' } },
    ])
    const r = recolour(base, 'light')
    expect(find(r, 'poi_r7').layout?.visibility).toBe('none')
    expect(find(r, 'highway-name-minor').layout?.visibility).toBe('none')
    expect(find(r, 'highway-name-major').layout?.visibility).toBeUndefined()
    expect(find(r, 'highway-shield-non-us').layout?.visibility).toBe('none')
    expect(find(r, 'road_one_way_arrow').layout?.visibility).toBe('none')
    expect(find(r, 'label_city').layout?.['icon-image']).toBeUndefined()
    expect(find(r, 'label_city').layout?.['text-field']).toBe('a')
    expect(find(r, 'label_city').paint!['text-color']).toBe(LIGHT.text)
  })

  it('hides 3D buildings in both themes', () => {
    const base = style([{ id: 'building-3d', type: 'fill-extrusion', paint: { 'fill-extrusion-opacity': 0.8 } }])
    expect(find(recolour(base, 'light'), 'building-3d').layout?.visibility).toBe('none')
    expect(find(recolour(base, 'dark'), 'building-3d').layout?.visibility).toBe('none')
  })

  it('splits neighbourhood names out of the place labels, shown from zoom 14', () => {
    const base = style([{ id: 'label_other', type: 'symbol', minzoom: 8, filter: ['match', ['get', 'class'], ['city'], false, true], layout: { 'text-field': 'a' } }])
    const r = recolour(base, 'light')
    const other = find(r, 'label_other')
    const hood = find(r, 'label_neighbourhood')
    expect(other.minzoom).toBe(8)
    expect(hood.minzoom).toBe(14)
    expect(JSON.stringify(other.filter)).toContain('"!"')
    expect(JSON.stringify(hood.filter)).toContain('neighbourhood')
  })
})
