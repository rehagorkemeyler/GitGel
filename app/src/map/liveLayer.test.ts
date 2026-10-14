import { describe, expect, it } from 'vitest'
import type { Line } from '../lib/data'
import { ACCENT } from '../lib/colors'
import { busLinesByName, hexOf, pillText } from './liveLayer'

const line = (name: string, mode: string, color: string) => ({ name, mode, color }) as Line

describe('live bus markers', () => {
  it('colours a bus by its bus line when a rail line shares the name', () => {
    const m = busLinesByName([line('T1', 'tram', '0000ff'), line('T1', 'bus', 'ff0000'), line('T1', 'tram', '00ff00')])
    expect(m.get('T1')?.color).toBe('ff0000')
  })

  it('falls back to the accent for a line without a colour', () => {
    expect(hexOf('')).toBe(ACCENT)
    expect(hexOf(undefined)).toBe(ACCENT)
    expect(hexOf('D7263D')).toBe('#d7263d')
  })

  it('writes the pill in the line colour unless it is too pale on white', () => {
    expect(pillText('#d7263d')).toBe('#d7263d')
    expect(pillText('#ffe600')).toBe('#1c1c1e')
  })
})
