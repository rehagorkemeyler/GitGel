import { describe, expect, it } from 'vitest'
import { filterMatches, lineRows, MAX_ROWS_UNFILTERED, modesPresent, sortLines } from './lineList'
import type { Line } from './data'
import type { Mode } from './search'

const line = (name: string, mode: Mode, long = name) =>
  ({ id: `${mode}-${name}`, name, long_name: long, mode, color: '', text_color: '', agency: '' }) as Line

describe('lineList', () => {
  it('sorts by network order, then Turkish numeric name', () => {
    const lines = [line('10', 'bus'), line('M10', 'metro'), line('B1', 'rail'), line('2', 'bus'), line('M2', 'metro')]
    expect(sortLines(lines).map((l) => l.name)).toEqual(['M2', 'M10', 'B1', '2', '10'])
  })
  it('treats metrobus as bus in the bus filter', () => {
    const mb = line('34', 'metrobus')
    expect(filterMatches(mb, 'bus')).toBe(true)
    expect(filterMatches(line('F1', 'ferry'), 'bus')).toBe(false)
    expect(filterMatches(line('F1', 'ferry'), 'all')).toBe(true)
    expect(modesPresent([mb, line('M1', 'metro')])).toEqual(new Set(['bus', 'metro']))
  })
  it('caps the unfiltered, untyped list at 120 rows across all modes', () => {
    const many = Array.from({ length: 130 }, (_, i) => line(`A${i + 1}`, 'bus'))
    const sorted = sortLines(many)
    expect(lineRows(sorted, '', 'all')).toHaveLength(MAX_ROWS_UNFILTERED)
    // Typed text and a mode filter are not capped: every match is listed.
    expect(lineRows(sorted, 'a', 'all')).toHaveLength(130)
    expect(lineRows(sorted, '', 'bus')).toHaveLength(130)
  })
  it('matches typed text on the name start or inside the long name', () => {
    const sorted = sortLines([line('M2', 'metro', 'Yenikapı - Hacıosman'), line('M1A', 'metro', 'Yenikapı - Atatürk')])
    expect(lineRows(sorted, 'hacı', 'all').map((l) => l.name)).toEqual(['M2'])
    expect(lineRows(sorted, 'm1', 'all').map((l) => l.name)).toEqual(['M1A'])
  })
})
