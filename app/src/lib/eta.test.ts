import { describe, expect, it } from 'vitest'
import { ago, eta } from './eta'

describe('eta', () => {
  it('shows minutes and seconds, then "at the stop"', () => {
    expect(eta(192)).toMatch(/^3 \S+ 12 \S+$/)
    expect(eta(45)).toMatch(/^45 \S+$/)
    expect(eta(20)).toBe(eta(0))
    expect(eta(-5)).toBe(eta(0))
  })
  it('says how old a GPS fix is', () => {
    const now = Date.parse('2026-09-26T20:00:00Z')
    expect(ago('2026-09-26T19:59:48Z', now)).toMatch(/^12 /)
    expect(ago('2026-09-26T19:57:00Z', now)).toMatch(/^3 /)
  })
})
