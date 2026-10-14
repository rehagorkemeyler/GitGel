import { describe, expect, it } from 'vitest'
import { hasProblem, lineMessage, problemLineIds, problemsOf, stopDisruptions } from './status'
import type { Line } from './data'
import type { Itinerary, Leg } from './api'

const status = { lines: [{ line: 'M7', message: 'x', updated: '' }], announcements: [], stale: false }
const line = (id: string, name: string) => ({ id, name, long_name: '', mode: 'metro', color: '', text_color: '', agency: '' }) as Line
const leg = (mode: string, routeShortName?: string) =>
  ({ mode, from: { name: 'a', lat: 0, lon: 0 }, to: { name: 'b', lat: 0, lon: 0 }, startTime: '', endTime: '', duration: 60, routeShortName }) as Leg
const trip = (...legs: Leg[]) => ({ duration: 0, startTime: '', endTime: '', transfers: 0, legs }) as Itinerary

describe('status helpers', () => {
  it('maps status short names to line ids', () => {
    const lines = new Map([['m7', line('m7', 'M7')], ['m2', line('m2', 'M2')]])
    expect([...problemLineIds(status, lines)]).toEqual(['m7'])
    expect(problemLineIds(null, lines).size).toBe(0)
  })
  it('matches departures by short name, case-insensitively', () => {
    expect(hasProblem(status, 'm7')).toBe(true)
    expect(hasProblem(status, 'M2')).toBe(false)
  })
  it('finds the message of a line, or none', () => {
    expect(lineMessage(status, 'm7')).toBe('x')
    expect(lineMessage(status, 'M2')).toBeUndefined()
    expect(lineMessage(null, 'M7')).toBeUndefined()
  })
  it('lists the rides of an itinerary that have a problem, once, walks left out', () => {
    const it = trip(leg('WALK'), leg('SUBWAY', 'M7'), leg('BUS', 'm2'), leg('SUBWAY', 'M7'))
    expect(problemsOf(it, ['M7'])).toEqual(['M7'])
    expect(problemsOf(it, ['m2', 'M7'])).toEqual(['M7', 'm2'])
    expect(problemsOf(it, ['M9'])).toEqual([])
    expect(problemsOf(trip(leg('WALK', 'M7')), ['M7'])).toEqual([])
  })
  it('lists the status lines that stop at this station', () => {
    const lines = new Map([['m7', line('m7', 'M7')], ['m2', line('m2', 'M2')]])
    expect(stopDisruptions(status, lines, ['m7'])).toEqual(status.lines)
    expect(stopDisruptions(status, lines, ['m2'])).toEqual([])
    expect(stopDisruptions(null, lines, ['m7'])).toEqual([])
  })
})
