import { expect, it } from 'vitest'
import { nearestStops } from './nearby'
import type { StopRow } from './data'

const s = (id: string, mode: StopRow['mode'], lat: number, lon: number): StopRow => ({ id, name: id, lat, lon, mode, lines: [] })

it('lists stations first, then close bus stops, and drops far ones', () => {
  const stops = [
    s('bus-near', 'bus', 41.0001, 29.0),
    s('metro-mid', 'metro', 41.008, 29.0),
    s('bus-far', 'bus', 41.01, 29.0),
    s('metro-far', 'metro', 41.1, 29.0),
  ]
  expect(nearestStops(stops, 41.0, 29.0).map((x) => x.id)).toEqual(['metro-mid', 'bus-near'])
})

it('merges platforms of the same station', () => {
  const a = { ...s('a', 'metro', 41.0005, 29.0), name: 'Yenikapı', lines: ['m2'] }
  const b = { ...s('b', 'rail', 41.0006, 29.0), name: 'Yenikapı', lines: ['marmaray'] }
  const r = nearestStops([a, b], 41.0, 29.0)
  expect(r).toHaveLength(1)
  expect(r[0].lines).toEqual(['m2', 'marmaray'])
})
