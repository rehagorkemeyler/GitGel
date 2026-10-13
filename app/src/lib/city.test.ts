import { describe, expect, it } from 'vitest'
import { CITIES, cityAt, inBounds, liveStop, stopCode } from './city'
import { crowding } from './live'

describe('city', () => {
  it('finds the city of a position', () => {
    expect(cityAt([28.98, 41.03])).toBe('istanbul')
    expect(cityAt([32.854, 39.92])).toBe('ankara')
    expect(cityAt([29.06, 40.195])).toBe('bursa') // Kent Meydanı
    expect(cityAt([28.89, 40.372])).toBe('bursa') // Mudanya
    expect(cityAt([27.14, 38.42])).toBeNull() // İzmir
    expect(cityAt(null)).toBeNull()
  })
  it('keeps each centre inside its bounds', () => {
    for (const c of Object.values(CITIES)) expect(inBounds(c.center, c.bounds)).toBe(true)
  })
  it('city boxes do not overlap', () => {
    const cs = Object.values(CITIES)
    for (const a of cs)
      for (const b of cs)
        if (a !== b)
          expect(a.bounds[0][0] < b.bounds[1][0] && b.bounds[0][0] < a.bounds[1][0] && a.bounds[0][1] < b.bounds[1][1] && b.bounds[0][1] < a.bounds[1][1]).toBe(false)
  })
  it('knows which stops have a live board', () => {
    expect(liveStop('eg_11654', CITIES.ankara)).toBe('11654')
    expect(stopCode('eg_11654', CITIES.ankara)).toBe('11654')
    expect(liveStop('br_564', CITIES.ankara)).toBeNull()
    expect(liveStop('br_564', CITIES.bursa)).toBe('564')
    expect(liveStop('br_18601', CITIES.bursa)).toBe('18601')
    expect(liveStop('eg_11654', CITIES.bursa)).toBeNull()
    expect(stopCode('br_564', CITIES.bursa)).toBeNull()
    expect(liveStop('br_564', CITIES.istanbul)).toBeNull()
  })
})

describe('crowding (Bursa boardings this trip)', () => {
  it('turns boardings into a level', () => {
    expect(crowding(0)).toBe('low')
    expect(crowding(29)).toBe('low')
    expect(crowding(30)).toBe('medium')
    expect(crowding(60)).toBe('medium')
    expect(crowding(61)).toBe('high')
    expect(crowding(null)).toBeNull()
    expect(crowding(undefined)).toBeNull()
    expect(crowding(-1)).toBeNull()
  })
})
