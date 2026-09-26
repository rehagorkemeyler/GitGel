import { describe, expect, it } from 'vitest'
import { CITIES, cityAt, inBounds } from './city'

describe('city', () => {
  it('finds the city of a position', () => {
    expect(cityAt([28.98, 41.03])).toBe('istanbul')
    expect(cityAt([32.854, 39.92])).toBe('ankara')
    expect(cityAt([27.14, 38.42])).toBeNull() // İzmir
    expect(cityAt(null)).toBeNull()
  })
  it('keeps each centre inside its bounds', () => {
    for (const c of Object.values(CITIES)) expect(inBounds(c.center, c.bounds)).toBe(true)
  })
})
