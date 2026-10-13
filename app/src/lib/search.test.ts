import { describe, expect, it } from 'vitest'
import { editDistance, fold, searchIndex, type IndexRow } from './search'

const index: IndexRow[] = [
  ['Kadıköy', 'kadikoy', 40.99, 29.02, 'metro', ['M4']],
  ['Kadıköy İskele', 'kadikoy iskele', 40.99, 29.02, 'bus', ['14B']],
  ['Yenikapı', 'yenikapi', 41.0, 28.95, 'rail', ['Marmaray', 'M1A', 'M2']],
  ['Ayrılık Çeşmesi', 'ayrilik cesmesi', 41.0, 29.03, 'metro', ['M4', 'Marmaray']],
  ['Kadırga', 'kadirga', 41.0, 28.97, 'bus', ['80T']],
]

describe('search', () => {
  it('folds Turkish characters', () => {
    expect(fold('Ayrılık Çeşmesi')).toBe('ayrilik cesmesi')
    expect(fold('İSTANBUL')).toBe('istanbul')
  })

  it('counts transpositions as one edit', () => {
    expect(editDistance('kadikyo', 'kadikoy')).toBe(1)
  })

  it('finds without Turkish characters and ranks rail first', () => {
    const r = searchIndex(index, 'kadikoy')
    expect(r[0].name).toBe('Kadıköy')
    expect(r[1].name).toBe('Kadıköy İskele')
  })

  it('tolerates typos', () => {
    expect(searchIndex(index, 'yenikpai')[0]?.name).toBe('Yenikapı')
    expect(searchIndex(index, 'ayrilik cesmsi')[0]?.name).toBe('Ayrılık Çeşmesi')
  })

  it('matches prefixes while typing', () => {
    expect(searchIndex(index, 'ayr')[0]?.name).toBe('Ayrılık Çeşmesi')
    expect(searchIndex(index, 'kadı').map((p) => p.name)).toContain('Kadırga')
  })

  it('finds stops by code: Ankara numbers, Bursa letters and digits', () => {
    const coded: IndexRow[] = [
      ['Güvenpark', 'guvenpark', 39.92, 32.85, 'bus', ['185'], '11654'],
      ['Kent Meydanı 1', 'kent meydani 1', 40.197, 29.06, 'bus', ['38'], 'D0441'],
      ['Kent Meydanı 2', 'kent meydani 2', 40.196, 29.061, 'bus', ['38'], 'D0442'],
      ['Adliye', 'adliye', 40.193, 29.07, 'tram', ['T1'], 'B69'],
    ]
    expect(searchIndex(coded, '11654')[0]?.name).toBe('Güvenpark')
    expect(searchIndex(coded, 'D0441')[0]?.name).toBe('Kent Meydanı 1')
    expect(searchIndex(coded, 'd441')[0]?.name).toBe('Kent Meydanı 1')
    expect(searchIndex(coded, '0442')[0]?.name).toBe('Kent Meydanı 2')
    expect(searchIndex(coded, 'd044').map((r) => r.name)).toEqual(['Kent Meydanı 1', 'Kent Meydanı 2'])
    expect(searchIndex(coded, 'b441')).toEqual([])
  })
})
