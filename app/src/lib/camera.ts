// Camera and sheet geometry shared by the map, the bottom sheet and the locate button.
// The numbers are native's: theme/tokens.ts (motion.cameraMs, sheetGap), App.tsx (the map padding,
// the locate button fade, the 450 ms fit delay) and MapScreen.tsx (the edge padding of a fit).
import type { Map as MlMap } from 'maplibre-gl'
import { DEFAULT_SHARE } from './sheet'

/** Native motion.cameraMs: every camera move takes this long (0 with reduced motion). */
export const CAMERA_MS = 400
/** Native locate: the camera goes to zoom 16 on every press (the first fix of a session: 15). */
export const LOCATE_ZOOM = 16
export const FIRST_FIX_ZOOM = 15
/** Native opens a stop card on the map at zoom 16. */
export const STOP_ZOOM = 16
/** Native fits the camera 450 ms after the route, the options or the line change, once the sheet has settled. */
export const FIT_DELAY_MS = 450
/** Native sheetGap: the sheet floats 8 px above the bottom edge and the map keeps 8 px more. */
export const SHEET_GAP = 8
/** Native mapPadding top: the top pills sit 56 px below the safe area. */
export const TOP_CHROME = 56
/** Native edgePadding: a fitted route or line keeps 48 px from every side of the map. */
export const EDGE_PAD = 48
/** Native first region: the longitude span shown at the city centre (MapScreen.tsx initialRegion). */
export const START_LON_SPAN = 0.22

/** True when the system asks for less motion (native "remove animations"). */
export function reduceMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Duration of one camera move in ms: native cameraMs, 0 with reduced motion. */
export function cameraMs(): number {
  return reduceMotion() ? 0 : CAMERA_MS
}

let insets: { top: number; bottom: number } | null = null

/** Safe-area insets in px (env(safe-area-inset-*)), read once. Zero where there is no DOM (tests) or no inset. */
export function safeInsets(): { top: number; bottom: number } {
  if (insets) return insets
  insets = { top: 0, bottom: 0 }
  if (typeof document === 'undefined' || !document.body) return insets
  try {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'
    document.body.appendChild(probe)
    const cs = getComputedStyle(probe)
    insets = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }
    probe.remove()
  } catch {
    // Keep zero insets: the layout still works, the chrome is just not offset.
  }
  return insets
}

/**
 * The map's bottom padding for a sheet whose visible part is `visible` px on a screen `vh` px tall
 * (native padding: the sheet height up to 40% of the screen, plus the bottom inset and the sheet gap).
 */
export function mapBottomInset(visible: number, vh: number): number {
  return Math.min(visible, Math.round(vh * DEFAULT_SHARE)) + safeInsets().bottom + SHEET_GAP
}

/** Padding for a route or line fit (native mapPadding plus edgePadding): the top pills and the sheet stay clear. */
export function fitPadding(bottomInset: number): { top: number; left: number; right: number; bottom: number } {
  return {
    top: safeInsets().top + TOP_CHROME + EDGE_PAD,
    left: EDGE_PAD,
    right: EDGE_PAD,
    bottom: bottomInset + EDGE_PAD,
  }
}

/**
 * Opacity of the locate button while the sheet's top edge is at `top` px from the top of the screen:
 * 0 when the sheet reaches the top area (native insets.top + 120), 1 when it sits at 35% of the screen.
 */
export function locateFade(top: number, vh: number, safeTop = 0): number {
  const from = safeTop + 120
  const to = vh * 0.35
  if (to <= from) return top >= to ? 1 : 0
  return Math.min(1, Math.max(0, (top - from) / (to - from)))
}

/** The sheet's top edge, in px from the top of the screen, when its visible part is `visible` px tall. */
export function sheetTopOf(visible: number, vh: number, safeBottom = 0): number {
  return vh - SHEET_GAP - safeBottom - visible
}

/** Start zoom for the city: START_LON_SPAN across `width` CSS px (native zoomOf uses 256 px tiles, MapLibre 512). */
export function startZoom(width: number): number {
  if (!(width > 0)) return 10.4
  return Math.log2((360 / START_LON_SPAN) * (width / 512))
}

/** Frames the coordinates above the sheet and the top pills, in one camera move. A single point frames nothing. */
export function fitCoords(m: MlMap, coords: [number, number][], bottomInset: number): void {
  if (!coords.length) return
  let minX = 180
  let minY = 90
  let maxX = -180
  let maxY = -90
  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (minX === maxX && minY === maxY) return
  m.fitBounds(
    [
      [minX, minY],
      [maxX, maxY],
    ],
    { padding: fitPadding(bottomInset), duration: cameraMs() },
  )
}
