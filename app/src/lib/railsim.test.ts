import { expect, it } from 'vitest'
import { positionAndBearing, positionAt, prepare } from './railsim'
import type { TripSegment } from './api'

// Encoded (precision 5) straight line from (41.0, 29.0) to (41.0, 29.1).
function encode(points: [number, number][]): string {
  let out = ''
  let plat = 0
  let plon = 0
  const enc = (v: number) => {
    let x = v < 0 ? ~(v << 1) : v << 1
    let s = ''
    while (x >= 0x20) {
      s += String.fromCharCode((0x20 | (x & 0x1f)) + 63)
      x >>= 5
    }
    return s + String.fromCharCode(x + 63)
  }
  for (const [lat, lon] of points) {
    const a = Math.round(lat * 1e5)
    const b = Math.round(lon * 1e5)
    out += enc(a - plat) + enc(b - plon)
    plat = a
    plon = b
  }
  return out
}

const seg: TripSegment = {
  trips: [{ tripId: 't1', routeShortName: 'M2' }],
  routeColor: '009944',
  mode: 'SUBWAY',
  departure: '2026-09-29T05:00:00Z',
  arrival: '2026-09-29T05:02:00Z',
  polyline: encode([
    [41.0, 29.0],
    [41.0, 29.1],
  ]),
}

it('interpolates along the segment', () => {
  const [s] = prepare([seg], new Set())
  const p = positionAt(s, Date.parse('2026-09-29T05:01:00Z'))!
  expect(p[0]).toBeCloseTo(29.05, 4)
  expect(p[1]).toBeCloseTo(41.0, 4)
  expect(positionAt(s, Date.parse('2026-09-29T05:03:00Z'))).toBeNull()
})

it('skips buses and lines with reported problems', () => {
  expect(prepare([{ ...seg, mode: 'BUS' }], new Set())).toHaveLength(0)
  expect(prepare([seg], new Set(['M2']))).toHaveLength(0)
})

it('gives the direction of travel as a compass bearing', () => {
  const [s] = prepare([seg], new Set())
  const r = positionAndBearing(s, Date.parse('2026-09-29T05:01:00Z'))!
  expect(r.bearing).toBeCloseTo(90, 0) // due east
})
