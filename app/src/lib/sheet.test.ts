import { describe, expect, it } from 'vitest'
import { MIN_VISIBLE, PEEK_H, SNAP, nearestSnap, snapHeights } from './sheet'

const VH = 800
const FULL = 760 // screen minus insets and the 16 px of gaps

describe('snapHeights', () => {
  it('uses native heights for long content: min 96, peek 214, default 40%, mid 65%, full', () => {
    const hs = snapHeights(900, VH, FULL)
    expect(hs[SNAP.min]).toBe(MIN_VISIBLE)
    expect(hs[SNAP.peek]).toBe(PEEK_H)
    expect(hs[SNAP.def]).toBe(Math.round(VH * 0.4))
    expect(hs[SNAP.mid]).toBe(Math.round(VH * 0.65))
    expect(hs[SNAP.full]).toBe(FULL)
  })

  it('caps the full height at the sheet size', () => {
    expect(snapHeights(2000, VH, FULL)[SNAP.full]).toBe(FULL)
  })

  it('opens short content whole as its default (up to half the screen)', () => {
    const hs = snapHeights(300, VH, FULL)
    expect(hs[SNAP.def]).toBe(300)
    expect(hs[SNAP.full]).toBe(300)
    expect(hs[SNAP.mid]).toBe(300)
  })

  it('keeps the peek at the content height when the content is shorter than 214 px', () => {
    const hs = snapHeights(150, VH, FULL)
    expect(hs[SNAP.peek]).toBe(150)
    expect(hs[SNAP.min]).toBe(MIN_VISIBLE)
    expect(hs[SNAP.full]).toBe(150)
  })

  it('never decreases from one snap to the next', () => {
    for (const need of [40, 96, 180, 260, 420, 640, 900]) {
      const hs = snapHeights(need, VH, FULL)
      for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeGreaterThanOrEqual(hs[i - 1])
    }
  })
})

describe('nearestSnap', () => {
  it('finds the closest height', () => {
    const hs = [96, 214, 320, 520, 700]
    expect(nearestSnap(hs, 230)).toBe(SNAP.peek)
    expect(nearestSnap(hs, 480)).toBe(SNAP.mid)
    expect(nearestSnap(hs, 5000)).toBe(SNAP.full)
  })

  it('takes the lower index on a tie', () => {
    expect(nearestSnap([100, 100, 300], 100)).toBe(0)
  })
})
