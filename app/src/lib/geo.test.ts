import { describe, expect, it } from 'vitest'
import { distanceLabel } from './geo'

describe('distance label', () => {
  it('rounds metres to 10 under a kilometre', () => {
    expect(distanceLabel(124)).toBe('120 m')
    expect(distanceLabel(5)).toBe('10 m')
    expect(distanceLabel(999)).toBe('1000 m')
  })
  it('shows kilometres with one decimal and a comma from 1 km', () => {
    expect(distanceLabel(1000)).toBe('1,0 km')
    expect(distanceLabel(1234)).toBe('1,2 km')
    expect(distanceLabel(12_400)).toBe('12,4 km')
  })
})
