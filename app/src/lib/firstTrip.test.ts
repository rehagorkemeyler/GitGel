import { describe, expect, it } from 'vitest'
import { nextFirstArrival } from './firstTrip'
import type { LineDetail } from './lineDetail'

const line = {
  directions: [
    {
      headsign: 'Ulus',
      stops: ['eg_1', 'eg_2'],
      offsets: [0, 12],
      first_last: { weekday: ['06:10', '23:00'], saturday: ['07:00', '23:00'] },
    },
  ],
} as unknown as LineDetail

// Ankara local time -> epoch ms
const at = (iso: string) => Date.parse(iso + '+03:00')

describe('nextFirstArrival', () => {
  it('Friday 23:56 -> Saturday first trip plus the minutes to this stop', () => {
    expect(nextFirstArrival(line, 'eg_2', at('2026-09-25T23:56:00'))).toBe(at('2026-09-26T07:12:00'))
  })
  it('after midnight the next service day is the same calendar day', () => {
    expect(nextFirstArrival(line, 'eg_1', at('2026-09-29T00:30:00'))).toBe(at('2026-09-29T06:10:00'))
  })
  it('skips days the line does not run (no Sunday timetable)', () => {
    expect(nextFirstArrival(line, 'eg_1', at('2026-09-26T23:00:00'))).toBe(at('2026-09-28T06:10:00'))
  })
  it('unknown stop: null', () => {
    expect(nextFirstArrival(line, 'eg_9', at('2026-09-26T23:00:00'))).toBeNull()
  })
})
