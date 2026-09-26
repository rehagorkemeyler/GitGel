import { describe, expect, it } from 'vitest'
import { pickOptions, summarize } from './itinerary'
import type { Itinerary, Leg } from './api'

const leg = (mode: string, name: string | undefined, start: string, end: string): Leg => ({
  mode,
  routeShortName: name,
  startTime: start,
  endTime: end,
  duration: (Date.parse(end) - Date.parse(start)) / 1000,
  from: { name: 'A', lat: 0, lon: 0 },
  to: { name: 'B', lat: 0, lon: 0 },
})

const it1: Itinerary = {
  duration: 1800,
  startTime: '2026-09-29T05:00:00Z',
  endTime: '2026-09-29T05:30:00Z',
  transfers: 1,
  legs: [
    leg('WALK', undefined, '2026-09-29T05:00:00Z', '2026-09-29T05:05:00Z'),
    leg('REGIONAL_RAIL', 'Marmaray', '2026-09-29T05:05:00Z', '2026-09-29T05:15:00Z'),
    leg('SUBWAY', 'M2', '2026-09-29T05:18:00Z', '2026-09-29T05:27:00Z'),
    leg('WALK', undefined, '2026-09-29T05:27:00Z', '2026-09-29T05:30:00Z'),
  ],
}

describe('itinerary', () => {
  it('summarizes', () => {
    const s = summarize(it1)
    expect(s.minutes).toBe(30)
    expect(s.walkMinutes).toBe(8)
    expect(s.transfers).toBe(1)
    expect(s.rides.map((r) => r.name)).toEqual(['Marmaray', 'M2'])
    expect(s.rides[0].mode).toBe('rail')
  })

  it('drops repeated line sequences, keeps the earliest arrival', () => {
    const later = { ...it1, startTime: '2026-09-29T05:10:00Z', endTime: '2026-09-29T05:40:00Z' }
    expect(pickOptions([later, it1])).toEqual([it1])
  })
})
