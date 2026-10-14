import { describe, expect, it } from 'vitest'
import { isNewFix, type Fix } from './useGeolocation'

const base: Fix = { lon: 28.97, lat: 41.01, t: 1_000_000 }

describe('isNewFix', () => {
  it('takes the first fix', () => {
    expect(isNewFix(null, base)).toBe(true)
  })

  it('skips a fix that is less than 15 m and less than 5 s away', () => {
    // 0.0001 deg of latitude is about 11 m.
    expect(isNewFix(base, { ...base, lat: base.lat + 0.0001, t: base.t + 1000 })).toBe(false)
  })

  it('takes a fix 15 m away', () => {
    // 0.0002 deg of latitude is about 22 m.
    expect(isNewFix(base, { ...base, lat: base.lat + 0.0002, t: base.t + 1000 })).toBe(true)
  })

  it('takes a fix 5 s after the last one, even when still', () => {
    expect(isNewFix(base, { ...base, t: base.t + 5000 })).toBe(true)
    expect(isNewFix(base, { ...base, t: base.t + 4999 })).toBe(false)
  })
})
