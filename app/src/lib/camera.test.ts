import { describe, expect, it } from 'vitest'
import { fitPadding, locateFade, mapBottomInset, sheetTopOf, startZoom } from './camera'

describe('startZoom', () => {
  // Native zoomOf uses 256 px tiles (11.2 at 360 dp, 11.4 at 412 dp); MapLibre uses 512 px, one level less.
  it('matches native zoom minus one level for MapLibre 512 px tiles', () => {
    expect(startZoom(360)).toBeCloseTo(10.2, 1)
    expect(startZoom(412)).toBeCloseTo(10.4, 1)
  })

  it('falls back when the width is unknown', () => {
    expect(startZoom(0)).toBe(10.4)
    expect(startZoom(Number.NaN)).toBe(10.4)
  })
})

describe('locateFade', () => {
  // Native: opacity 0 when the sheet top reaches insets.top + 120, 1 when it sits at 35% of the screen.
  const vh = 800
  it('is 0 when the sheet reaches the top area', () => {
    expect(locateFade(120, vh, 0)).toBe(0)
    expect(locateFade(0, vh, 0)).toBe(0)
  })

  it('is 1 when the sheet sits at 35% of the screen or lower', () => {
    expect(locateFade(280, vh, 0)).toBe(1)
    expect(locateFade(600, vh, 0)).toBe(1)
  })

  it('rises linearly between the two thresholds', () => {
    expect(locateFade(200, vh, 0)).toBeCloseTo(0.5, 5)
  })

  it('moves the start with the safe-area top', () => {
    expect(locateFade(200, vh, 40)).toBeCloseTo((200 - 160) / (280 - 160), 5)
  })
})

describe('sheetTopOf', () => {
  it('is the viewport bottom less the sheet gap and the visible height', () => {
    expect(sheetTopOf(214, 800)).toBe(800 - 8 - 214)
    expect(sheetTopOf(214, 800, 20)).toBe(800 - 8 - 20 - 214)
  })
})

describe('mapBottomInset', () => {
  // Native: min(sheet height, 40% of the screen) + bottom inset + 8 px.
  it('follows the sheet below 40% of the screen', () => {
    expect(mapBottomInset(214, 800)).toBe(214 + 8)
  })

  it('caps at 40% of the screen', () => {
    expect(mapBottomInset(700, 800)).toBe(Math.round(800 * 0.4) + 8)
  })
})

describe('fitPadding', () => {
  // Native: mapPadding top 56 plus edgePadding 48; sides 48; bottom is the map inset plus 48.
  it('keeps the top pills and 48 px from every edge', () => {
    expect(fitPadding(328)).toEqual({ top: 56 + 48, left: 48, right: 48, bottom: 328 + 48 })
  })
})
