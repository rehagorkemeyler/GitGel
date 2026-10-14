import { describe, expect, it } from 'vitest'
import { inView, visibleNearest, type View } from './nearest'

const view: View = { lat: 41, lon: 29, latDelta: 0.2, lonDelta: 0.2 }

describe('inView', () => {
  it('accepts points up to 10 % past the edge, not further', () => {
    expect(inView(view, 41.1, 29)).toBe(true)
    expect(inView(view, 41.12, 29)).toBe(false)
    expect(inView(view, 41, 29.1)).toBe(true)
    expect(inView(view, 41, 29.12)).toBe(false)
  })
})

describe('visibleNearest', () => {
  it('keeps only items in view, nearest the centre first', () => {
    const items = [
      { id: 'far', lat: 41.09, lon: 29 },
      { id: 'out', lat: 42, lon: 29 },
      { id: 'near', lat: 41.01, lon: 29 },
      { id: 'mid', lat: 41, lon: 29.05 },
    ]
    expect(visibleNearest(items, view, 10).map((x) => x.id)).toEqual(['near', 'mid', 'far'])
  })

  it('caps the count', () => {
    const items = [0.01, 0.02, 0.03, 0.04].map((d, i) => ({ id: String(i), lat: 41 + d, lon: 29 }))
    expect(visibleNearest(items, view, 2).map((x) => x.id)).toEqual(['0', '1'])
  })

  it('weighs longitude by the cosine of the latitude', () => {
    // At lat 60 a degree of longitude is half as long, so the east point is nearer than the north one.
    const v: View = { lat: 60, lon: 29, latDelta: 1, lonDelta: 1 }
    const items = [
      { id: 'north', lat: 60.2, lon: 29 },
      { id: 'east', lat: 60, lon: 29.3 },
    ]
    expect(visibleNearest(items, v, 2).map((x) => x.id)).toEqual(['east', 'north'])
  })
})
