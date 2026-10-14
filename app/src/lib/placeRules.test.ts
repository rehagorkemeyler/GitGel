import { describe, expect, it } from 'vitest'
import { lineHits, searchesPlaces, stationIcon, stopSubline } from './placeRules'
import type { Line } from './data'

const line = (name: string) => ({ id: name.toLowerCase(), name, long_name: '', mode: 'metro', color: '', text_color: '', agency: '' }) as Line

describe('placeRules', () => {
  it('picks the stop icon by mode, as native stationIcon', () => {
    expect(stationIcon('bus')).toBe('bus')
    expect(stationIcon('metrobus')).toBe('bus')
    expect(stationIcon('ferry')).toBe('ship')
    expect(stationIcon('metro')).toBe('train')
    expect(stationIcon('tram')).toBe('train')
  })
  it('asks for places only from three letters', () => {
    expect(searchesPlaces('ka')).toBe(false)
    expect(searchesPlaces('kad')).toBe(true)
  })
  it('lists at most three line prefix matches, shortest name first', () => {
    const lines = ['M2', 'M11', 'M1A', 'M4', 'T1'].map(line)
    expect(lineHits(lines, 'm').map((l) => l.name)).toEqual(['M2', 'M4', 'M11'])
    expect(lineHits(lines, '')).toEqual([])
  })
  it('builds the stop subline from the code and the first five lines', () => {
    expect(stopSubline('11654', ['1', '2'])).toBe('11654 · 1, 2')
    expect(stopSubline(undefined, ['M2'])).toBe('M2')
    expect(stopSubline(undefined, [])).toBe('')
    expect(stopSubline('D0441', ['a', 'b', 'c', 'd', 'e', 'f'])).toBe('D0441 · a, b, c, d, e')
  })
})
