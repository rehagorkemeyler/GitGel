import { describe, expect, it } from 'vitest'
import { eta } from './eta'

describe('eta', () => {
  it('shows minutes and seconds, then "at the stop"', () => {
    expect(eta(192)).toMatch(/^3 \S+ 12 \S+$/)
    expect(eta(45)).toMatch(/^45 \S+$/)
    expect(eta(20)).toBe(eta(0))
    expect(eta(-5)).toBe(eta(0))
  })
})
