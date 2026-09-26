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
})
