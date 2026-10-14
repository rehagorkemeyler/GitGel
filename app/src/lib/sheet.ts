// Bottom sheet snap points, ported from native App.tsx (MIN_H, PEEK_H, DEFAULT_SHARE, FIT_SHARE, MID_SHARE).

/** Snap indexes into the five heights, lowest first. */
export const SNAP = { min: 0, peek: 1, def: 2, mid: 3, full: 4 } as const

/** px left on screen when minimized: grip and title. */
export const MIN_VISIBLE = 96
/** px of the peek height (the home screen's search box and cards). */
export const PEEK_H = 214
/** Default height: the content, but at most 40% of the screen. */
export const DEFAULT_SHARE = 0.4
/** Content up to half the screen opens whole. */
export const FIT_SHARE = 0.5
export const MID_SHARE = 0.65
/** A new panel's target follows its content for this long; after that the height is the user's. */
export const PENDING_MS = 1500

/**
 * The five heights for content `need` px tall (grip included) on a screen `vh` px tall.
 * `sheetFull` is the most the sheet can be (the screen minus the insets and the 8 px gaps).
 * Heights taller than the content collapse down, so a short panel never opens onto an empty
 * sheet, and heights never decrease from one snap to the next.
 */
export function snapHeights(need: number, vh: number, sheetFull: number): number[] {
  const n = Math.round(Math.max(MIN_VISIBLE, Math.min(sheetFull, need)))
  const raw = [
    Math.min(MIN_VISIBLE, n),
    Math.min(PEEK_H, n),
    n <= vh * FIT_SHARE ? n : Math.round(vh * DEFAULT_SHARE),
    Math.min(n, Math.round(vh * MID_SHARE)),
    n,
  ]
  for (let i = 1; i < raw.length; i++) raw[i] = Math.max(raw[i], raw[i - 1])
  return raw
}

/** Index of the height nearest to `px`; on a tie, the lower index. */
export function nearestSnap(heights: readonly number[], px: number): number {
  let best = 0
  for (let i = 1; i < heights.length; i++) {
    if (Math.abs(heights[i] - px) < Math.abs(heights[best] - px)) best = i
  }
  return best
}
