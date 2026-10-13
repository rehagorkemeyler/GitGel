import { describe, expect, it } from 'vitest'
import { countUse, topUsed, type Use } from './recent'

describe('use counts', () => {
  it('counts uses and keeps the latest time', () => {
    let m: Record<string, Use> = {}
    m = countUse(m, 'a', {}, 1)
    m = countUse(m, 'a', {}, 5)
    expect(m.a).toEqual({ n: 2, t: 5 })
  })

  it('lists only things used twice or more, most used first, latest first among equals', () => {
    const m: Record<string, Use> = {
      once: { n: 1, t: 9 },
      old: { n: 3, t: 1 },
      top: { n: 5, t: 2 },
      fresh: { n: 3, t: 8 },
    }
    expect(topUsed(m, 3)).toEqual(['top', 'fresh', 'old'])
    expect(topUsed(m, 1)).toEqual(['top'])
  })

  it('forgets the least used beyond the cap but never the one just used', () => {
    let m: Record<string, Use> = { a: { n: 4, t: 1 }, b: { n: 1, t: 2 }, c: { n: 1, t: 3 } }
    m = countUse(m, 'd', {}, 4, 3)
    expect(Object.keys(m).sort()).toEqual(['a', 'c', 'd'])
  })
})
