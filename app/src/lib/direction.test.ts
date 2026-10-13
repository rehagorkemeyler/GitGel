import { describe, expect, it } from 'vitest'
import { areaOf, directionFrom } from './direction'
import type { StopRow } from './data'
import type { LineDetail } from './lineDetail'

const stop = (id: string, name: string, lat: number, lon: number): StopRow => ({ id, name, lat, lon, mode: 'bus', lines: [] })
const stops = new Map(
  [
    stop('eg_1', 'Tuzluçayır', 39.9395, 32.935),
    stop('eg_2', 'Cebeci', 39.929, 32.883),
    stop('eg_3', 'Güvenpark', 39.9212, 32.8536),
    stop('eg_4', 'Dikmen Cd.', 39.885, 32.84),
    stop('eg_5', 'Otel', 39.8545, 32.8352),
  ].map((s) => [s.id, s]),
)
const line = {
  id: 'x',
  name: '173',
  long_name: '',
  mode: 'bus',
  color: '',
  text_color: '',
  agency: '',
  directions: [
    { headsign: 'Otel', stops: ['eg_1', 'eg_2', 'eg_3', 'eg_4', 'eg_5'], first_last: {} },
    { headsign: 'Tuzluçayır', stops: ['eg_5', 'eg_4', 'eg_3', 'eg_2', 'eg_1'], first_last: {} },
  ],
} as LineDetail

it('names the last stop after its area', () => {
  expect(areaOf({ lat: 39.8545, lon: 32.8352 }, 'ankara')).toBe('Oran')
  expect(areaOf({ lat: 39.0, lon: 33.0 }, 'ankara')).toBeNull()
  // Istanbul has no areas: the last stop's name is used.
  expect(areaOf({ lat: 39.8545, lon: 32.8352 }, 'istanbul')).toBeNull()
})

it('says the line passes Kızılay on its way', () => {
  expect(directionFrom(line, 'eg_2', stops, 'ankara')).toBe('Kızılay / Oran')
  expect(directionFrom(line, 'eg_4', stops, 'ankara')).toBe('Oran')
  // At Kızılay itself, Kızılay is not a direction.
  expect(directionFrom(line, 'eg_3', stops, 'ankara')).toBe('Oran')
})

it('uses the direction the stop is on', () => {
  const back = { ...line, directions: [line.directions[1]] }
  expect(directionFrom(back, 'eg_4', stops, 'ankara')).toBe('Kızılay / Mamak')
  expect(directionFrom(line, 'eg_9', stops, 'ankara')).toBeNull()
})

describe('Bursa', () => {
  const b = new Map(
    [
      stop('br_1', 'Terminal 1', 40.2659, 29.0574),
      stop('br_2', 'Beşyol', 40.2075, 29.061),
      stop('br_3', 'Kent Meydanı 2', 40.1961, 29.0614),
      stop('br_4', 'Altıparmak', 40.1905, 29.0508),
      stop('br_5', 'Uludağ Üniversitesi 1', 40.2241, 28.8709),
    ].map((s) => [s.id, s]),
  )
  const l38 = {
    ...line,
    name: '38',
    directions: [{ headsign: 'Uludağ Üniversitesi 1', stops: ['br_1', 'br_2', 'br_3', 'br_4', 'br_5'], first_last: {} }],
  } as LineDetail
  it('names Bursa areas and hubs', () => {
    expect(areaOf({ lat: 40.2241, lon: 28.8709 }, 'bursa')).toBe('Görükle')
    expect(areaOf({ lat: 40.3721, lon: 28.8902 }, 'bursa')).toBe('Mudanya')
    expect(directionFrom(l38, 'br_1', b, 'bursa')).toBe('Kent Meydanı / Görükle')
    expect(directionFrom(l38, 'br_3', b, 'bursa')).toBe('Görükle')
  })
})
