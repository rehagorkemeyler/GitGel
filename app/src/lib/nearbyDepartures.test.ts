import { describe, expect, it } from 'vitest'
import { minutesUntil, nearbyDepartures } from './nearbyDepartures'
import type { StopTime } from './api'
import type { Status } from './live'

const dep = (routeShortName: string): StopTime => ({ place: { name: '', lat: 0, lon: 0 }, routeShortName })
const status = { lines: [{ line: 'M7', message: '', updated: '' }], announcements: [], stale: false } as unknown as Status

describe('nearbyDepartures', () => {
  it('hides departures of lines with a problem and keeps three', () => {
    const list = [dep('M7'), dep('M2'), dep('34'), dep('M7'), dep('500T')]
    expect(nearbyDepartures(list, status).map((d) => d.routeShortName)).toEqual(['M2', '34', '500T'])
    expect(nearbyDepartures(list, null).map((d) => d.routeShortName)).toEqual(['M7', 'M2', '34'])
  })
  it('counts whole minutes and never goes negative', () => {
    const now = Date.UTC(2026, 9, 14, 10, 0, 0)
    expect(minutesUntil(new Date(now + 90_000), now)).toBe(2)
    expect(minutesUntil(new Date(now - 60_000), now)).toBe(0)
  })
})
