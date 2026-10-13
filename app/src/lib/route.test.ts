import { describe, expect, it } from 'vitest'
import type { Itinerary, Leg } from './api'
import { chain, headwayMinutes, leaveInMinutes, trackState } from './route'

const p = (name: string, lat: number, lon: number, t?: string) => ({ name, lat, lon, departure: t, arrival: t })
const leg = (mode: string, from: ReturnType<typeof p>, to: ReturnType<typeof p>, start: string, end: string, extra: Partial<Leg> = {}): Leg => ({
  mode,
  from,
  to,
  startTime: start,
  endTime: end,
  duration: (Date.parse(end) - Date.parse(start)) / 1000,
  ...extra,
})

const A = p('Ev', 41.0, 29.0)
const B = p('Şişhane', 41.03, 28.97)
const C1 = p('Haliç', 41.02, 28.965, '2026-09-27T08:51:00Z')
const C2 = p('Vezneciler', 41.012, 28.958, '2026-09-27T08:54:00Z')
const D = p('Yenikapı', 41.005, 28.952)
const E = p('Moda', 40.98, 29.025)

const trip: Itinerary = {
  duration: 31 * 60,
  startTime: '2026-09-27T08:43:00Z',
  endTime: '2026-09-27T09:14:00Z',
  transfers: 0,
  legs: [
    leg('WALK', A, B, '2026-09-27T08:43:00Z', '2026-09-27T08:47:00Z'),
    leg('SUBWAY', B, D, '2026-09-27T08:47:00Z', '2026-09-27T08:58:00Z', { routeShortName: 'M2', routeColor: '00a651', intermediateStops: [C1, C2] }),
    leg('WALK', D, D, '2026-09-27T08:58:00Z', '2026-09-27T08:58:30Z'),
    leg('SUBWAY', D, E, '2026-09-27T09:00:00Z', '2026-09-27T09:07:00Z', { routeShortName: 'Marmaray', intermediateStops: [] }),
    leg('WALK', E, E, '2026-09-27T09:07:00Z', '2026-09-27T09:14:00Z'),
  ],
}

describe('route helpers', () => {
  it('builds the walk › line › line › walk chain', () => {
    expect(chain(trip)).toEqual([
      { kind: 'walk', minutes: 4 },
      { kind: 'ride', name: 'M2', color: '00a651', textColor: undefined, mode: 'SUBWAY' },
      { kind: 'ride', name: 'Marmaray', color: undefined, textColor: undefined, mode: 'SUBWAY' },
      { kind: 'walk', minutes: 7 },
    ])
  })
  it('counts minutes until leaving', () => {
    expect(leaveInMinutes(trip, Date.parse('2026-09-27T08:40:30Z'))).toBe(2)
    expect(leaveInMinutes(trip, Date.parse('2026-09-27T08:50:00Z'))).toBe(0)
  })
  it('finds the typical headway', () => {
    const t = (m: number) => new Date(Date.UTC(2026, 8, 27, 8, m))
    expect(headwayMinutes([t(0), t(4), t(8), t(13)])).toBe(4)
    expect(headwayMinutes([t(0)])).toBeNull()
  })
  it('tracks by time without a position', () => {
    expect(trackState(trip, null, Date.parse('2026-09-27T08:44:00Z'))).toEqual({ leg: 0, getOffNext: false, arrived: false })
    expect(trackState(trip, null, Date.parse('2026-09-27T08:55:00Z'))).toEqual({ leg: 1, getOffNext: true, arrived: false })
  })
  it('tracks by position and warns one stop early', () => {
    const now = Date.parse('2026-09-27T08:48:00Z')
    expect(trackState(trip, { lat: B.lat, lon: B.lon }, now).leg).toBe(1)
    expect(trackState(trip, { lat: B.lat, lon: B.lon }, now).getOffNext).toBe(false)
    expect(trackState(trip, { lat: C2.lat, lon: C2.lon }, now)).toEqual({ leg: 1, getOffNext: true, arrived: false })
    expect(trackState(trip, { lat: E.lat, lon: E.lon }, now).arrived).toBe(true)
  })
})
