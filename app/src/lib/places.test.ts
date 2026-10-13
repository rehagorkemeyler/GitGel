import { describe, expect, it } from 'vitest'
import { addressQuery, categoryOf, formatDistance, nearestFirst, newSession } from './places'

describe('places helpers', () => {
  it('formats distances the Turkish way', () => {
    expect(formatDistance(342)).toBe('340 m')
    expect(formatDistance(1234)).toBe('1,2 km')
    expect(formatDistance(12_400)).toBe('12 km')
  })
  it('maps Google types to badge categories', () => {
    expect(categoryOf(['cafe', 'food'])).toBe('cafe')
    expect(categoryOf(['park'])).toBe('park')
    expect(categoryOf(['point_of_interest'])).toBe('other')
  })
  it('rewrites Turkish address shorthand', () => {
    expect(addressQuery('530 13')).toBe('530. Sokak No:13')
    expect(addressQuery('530/13')).toBe('530. Sokak No:13')
    expect(addressQuery('530 no 13')).toBe('530. Sokak No:13')
    expect(addressQuery('sancak 530')).toBe('Sancak Mahallesi 530. Sokak')
    expect(addressQuery('hilal 687')).toBe('Hilal Mahallesi 687. Sokak')
    expect(addressQuery('coffeelab kızılay')).toBe('coffeelab kızılay')
    expect(addressQuery('m2')).toBe('m2')
  })
  it('keeps the best match on top, then nearest first; chains fully by distance', () => {
    const s = (name: string, distance?: number) => ({ id: name + distance, name, sub: '', types: [], distance })
    expect(nearestFirst([s('TED Üniversitesi', 4200), s('Tedü Sem', 4300), s('TED Çelenk', 3200), s('X')]).map((x) => x.name)).toEqual([
      'TED Üniversitesi',
      'TED Çelenk',
      'Tedü Sem',
      'X',
    ])
    expect(nearestFirst([s("McDonald's", 9000), s("McDonald's", 1200), s('Mcdo Cafe', 300)]).map((x) => x.distance)).toEqual([300, 1200, 9000])
  })
  it('makes UUID-shaped session tokens', () => {
    expect(newSession()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(newSession()).not.toBe(newSession())
  })
})
