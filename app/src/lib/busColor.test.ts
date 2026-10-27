import { describe, expect, it } from 'vitest'
import { busColor, BUS_YELLOW, EGO_RED, OHO_BLUE } from './busColor'

describe('bus colours', () => {
  it('Istanbul and Bursa buses are yellow', () => {
    expect(busColor('istanbul', '500T')).toBe(BUS_YELLOW)
    expect(busColor('bursa', '1A')).toBe(BUS_YELLOW)
  })
  it('Ankara: EGO red, ÖHO blue', () => {
    expect(busColor('ankara', '427')).toBe(EGO_RED)
    expect(busColor('ankara', '427-7')).toBe(OHO_BLUE)
    expect(busColor('ankara', '999', '(ÖHO) Bir yer-Başka yer')).toBe(OHO_BLUE)
    expect(busColor('ankara', '185-6')).toBe(EGO_RED)
  })
})
