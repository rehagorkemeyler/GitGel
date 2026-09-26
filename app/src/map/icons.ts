import type { Map as MlMap } from 'maplibre-gl'

// Small map symbols drawn on a canvas (no image files, sharp on retina).
const GLYPHS = {
  train: 'M12 2C8 2 5 2.5 5 6v9.5A3.5 3.5 0 0 0 8.5 19L7 20.5v.5h2.2l2-2h1.6l2 2H17v-.5L15.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-3-4-7-4ZM8.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm2.5-6H7V6h4v4Zm2 0V6h4v4h-4Zm2.5 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z',
  tram: 'M10 2h4v1.5h-1.25L13.5 5C16.5 5.1 19 5.8 19 8.5V17a3 3 0 0 1-2.2 2.9L18 21.5v.5h-2.2l-2-2h-3.6l-2 2H6v-.5l1.2-1.6A3 3 0 0 1 5 17V8.5C5 5.8 7.5 5.1 10.5 5l.75-1.5H10V2Zm-3 7v4h10V9H7Zm1.5 6a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm7 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z',
  ferry: 'M12 3l1 2h3v4l3 1-2.2 6.4A6 6 0 0 1 12 19a6 6 0 0 1-4.8-2.6L5 10l3-1V5h3l1-2Zm-2 4v1.4l2-.7 2 .7V7h-4ZM3 20c1.5 0 3-1 3-1s1.5 1 3 1 3-1 3-1 1.5 1 3 1 3-1 3-1 1.5 1 3 1v2c-1.5 0-3-1-3-1s-1.5 1-3 1-3-1-3-1-1.5 1-3 1-3-1-3-1-1.5 1-3 1v-2Z',
  cable: 'M3 3l18-2v2L13 4v2h3a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h3V4.2L3 5V3Zm4 6v4h4V9H7Zm6 0v4h4V9h-4Z',
  bus: 'M6 3h12a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.73V20h-3v-2H8v2H5v-2.27A2 2 0 0 1 4 16V5a2 2 0 0 1 2-2Zm0 3v5h12V6H6Zm1.5 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
} as const

export type Glyph = keyof typeof GLYPHS

/** Icon name for a station mode. */
export function glyphFor(mode: string): Glyph {
  if (mode === 'tram') return 'tram'
  if (mode === 'ferry') return 'ferry'
  if (mode === 'cablecar') return 'cable'
  if (mode === 'bus' || mode === 'metrobus') return 'bus'
  return 'train'
}

function draw(glyph: Glyph, bg: string, fg: string, border: string | null, size: number, ratio: number): ImageData {
  const px = size * ratio
  const c = document.createElement('canvas')
  c.width = c.height = px
  const ctx = c.getContext('2d')!
  ctx.scale(ratio, ratio)
  const r = size * 0.28
  ctx.beginPath()
  ctx.roundRect(1, 1, size - 2, size - 2, r)
  ctx.fillStyle = bg
  ctx.fill()
  if (border) {
    ctx.lineWidth = 1.5
    ctx.strokeStyle = border
    ctx.stroke()
  }
  // Glyph drawn in a 24 box, scaled into the tile with some padding.
  const inner = size * 0.64
  ctx.translate((size - inner) / 2, (size - inner) / 2)
  ctx.scale(inner / 24, inner / 24)
  ctx.fillStyle = fg
  ctx.fill(new Path2D(GLYPHS[glyph]))
  return ctx.getImageData(0, 0, px, px)
}

/** Add station (dark tile, white glyph) and bus stop (light tile) icons to the current style. */
export function addTransitIcons(map: MlMap, dark: boolean): void {
  const ratio = 2
  const stationBg = dark ? '#f2f2f7' : '#1c1c1e'
  const stationFg = dark ? '#1c1c1e' : '#ffffff'
  for (const g of Object.keys(GLYPHS) as Glyph[]) {
    const name = `gg-${g}`
    if (map.hasImage(name)) continue
    map.addImage(name, draw(g, stationBg, stationFg, null, 22, ratio), { pixelRatio: ratio })
  }
  if (!map.hasImage('gg-busstop')) {
    map.addImage('gg-busstop', draw('bus', dark ? '#2c2c2e' : '#ffffff', dark ? '#e5e5ea' : '#3a3a3c', dark ? '#636366' : '#8e8e93', 18, ratio), {
      pixelRatio: ratio,
    })
  }
}
