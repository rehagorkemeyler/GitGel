import { describe, expect, it } from 'vitest'
import { t } from '../i18n'
import type { Vehicle } from './live'
import { busFacts, busLabel, busTitle, busTitleLines } from './bubble'

const bus: Vehicle = { id: 'b1', lat: 41, lon: 29, line: '12', headsign: 'Kadıköy', at: '2026-10-14T10:00:00Z' }

describe('live bus bubble facts', () => {
  it('shows plate and speed without a speed label, rounded', () => {
    expect(busFacts({ ...bus, plate: '16 BJZ 19', speed: 41.6 })).toEqual(['16 BJZ 19', `42 ${t('kmh')}`])
  })

  it('adds the accessibility features in native order', () => {
    const v = { ...bus, plate: '34 AB 1', speed: 0, features: ['Körüklü', 'Engelli'] }
    expect(busFacts(v)).toEqual(['34 AB 1', `0 ${t('kmh')}`, `♿ ${t('accessible')}`, t('articulated')])
  })

  it('drops missing parts', () => {
    expect(busFacts(bus)).toEqual([])
    expect(busFacts({ ...bus, speed: null, plate: null })).toEqual([])
  })

  it('labels the card "line, facts", or just the line when there are no facts', () => {
    expect(busLabel({ ...bus, plate: 'X', speed: 10 })).toBe(`12, X, 10 ${t('kmh')}`)
    expect(busLabel(bus)).toBe('12')
  })
})

describe('live bus bubble title', () => {
  it('uses the long name, falls back to the headsign when the name is empty', () => {
    expect(busTitle('Kadıköy - Üsküdar', 'x')).toBe('Kadıköy - Üsküdar')
    expect(busTitle('', 'Kadıköy')).toBe('Kadıköy')
    expect(busTitle(null, undefined)).toBe('')
  })

  it('takes two lines only while crowding is shown', () => {
    expect(busTitleLines(true)).toBe(2)
    expect(busTitleLines(false)).toBe(1)
  })
})
