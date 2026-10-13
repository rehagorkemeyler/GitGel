import { describe, expect, it } from 'vitest'
import { hasProblem, problemLineIds } from './status'
import type { Line } from './data'

const status = { lines: [{ line: 'M7', message: 'x', updated: '' }], announcements: [], stale: false }
const line = (id: string, name: string) => ({ id, name, long_name: '', mode: 'metro', color: '', text_color: '', agency: '' }) as Line

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
})
