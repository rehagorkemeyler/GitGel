import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { DEFAULT_SHARE, PENDING_MS, SNAP, nearestSnap, snapHeights } from '../lib/sheet'
import './BottomSheet.css'

/** What the parent can ask of the sheet (native GlassSheet ref). */
export type SheetHandle = {
  /** The next content change moves the sheet: to this snap, or to a saved height `px` (a panel coming back). */
  goTo: (snap: number, px?: number) => void
  /** Moves now (a trip started: peek). */
  snapTo: (snap: number) => void
  /** Height in px the sheet last settled at. */
  height: () => number
}

type Props = {
  /** Main content (search, station card, route list...). */
  peek: ReactNode
  /** More content below the main part (line page stops). */
  children?: ReactNode
  label: string
  /** Changes with the top panel. A new panel moves the sheet to its goTo target; replaced content keeps the height. */
  contentKey: string
  /** The snap the handle returns to from the top: the top panel's default. */
  defaultSnap?: number
  /**
   * The sheet's visible height in px. `live` is true while a drag moves it (the locate button rides
   * on it frame by frame), false once it has settled (the map's padding follows that).
   */
  onVisible?: (px: number, live: boolean) => void
}

const VELOCITY = 0.4 // px/ms that counts as a flick

type Dims = { sheetH: number; gripH: number; contentH: number; vh: number }

const sameDims = (a: Dims, b: Dims) =>
  a.sheetH === b.sheetH && a.gripH === b.gripH && a.contentH === b.contentH && a.vh === b.vh

const isTextField = (el: EventTarget) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

/**
 * Draggable bottom sheet, floating 8 px in from the screen edges (native GlassSheet), with five
 * heights (native App.tsx): minimized, peek, default, middle and full. Heights taller than the
 * content collapse, so short content opens whole. The content scrolls inside at full height; from
 * its top a downward drag moves the sheet again, anywhere on the sheet. The sheet stops hard at
 * its highest and lowest height (no rubber band, as native).
 *
 * Moves only with transform (60 fps on low-end Android); the spring-like easing lives in CSS and
 * respects reduced motion.
 */
export const BottomSheet = forwardRef<SheetHandle, Props>(function BottomSheet(
  { peek, children, label, contentKey, defaultSnap = SNAP.def, onVisible },
  ref,
) {
  const sheet = useRef<HTMLElement>(null)
  const grip = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<Dims>({
    sheetH: 0,
    gripH: 0,
    contentH: 0,
    vh: typeof window !== 'undefined' ? window.innerHeight : 800,
  })
  const [visible, setVisible] = useState(0) // px the sheet rests at
  const [drag, setDrag] = useState<number | null>(null)
  // Where the sheet goes when the content changes (set by goTo); null keeps the height the user has.
  const pending = useRef<{ snap: number; px?: number } | null>({ snap: SNAP.peek })
  const lastPx = useRef(0) // last height the sheet settled at
  // Height to return to when the text field that extended the sheet is left (null when none did).
  const restoreAfterFocus = useRef<number | null>(null)

  const { sheetH, gripH, contentH, vh } = dims
  const heights = snapHeights(gripH + contentH, vh, sheetH)
  const heightsRef = useRef(heights)
  const shown = visible
  const y = drag ?? sheetH - shown
  const topY = sheetH - heights[SNAP.full]
  const bottomY = sheetH - heights[SNAP.min]
  const atFull = shown >= heights[SNAP.full] && heights[SNAP.full] > heights[SNAP.mid]

  // Measures the content and puts the sheet where its pending target says, or keeps its height.
  const place = useCallback(() => {
    const next: Dims = {
      sheetH: sheet.current?.offsetHeight ?? 0,
      gripH: grip.current?.offsetHeight ?? 0,
      contentH: inner.current?.offsetHeight ?? 0,
      vh: window.innerHeight,
    }
    const hs = snapHeights(next.gripH + next.contentH, next.vh, next.sheetH)
    const p = pending.current
    const want = p ? (p.px ?? hs[p.snap]) : lastPx.current
    const px = hs[nearestSnap(hs, want)]
    lastPx.current = px
    setDims((d) => (sameDims(d, next) ? d : next))
    setVisible(px)
  }, [])

  useLayoutEffect(() => {
    const ro = new ResizeObserver(place)
    for (const el of [sheet.current, inner.current]) if (el) ro.observe(el)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [place])

  // A new panel (or replaced content) is measured at once, before paint. The pending target
  // lasts 1.5 s, so content that loads in (skeleton, then rows) still lands on the target.
  useLayoutEffect(() => {
    place()
    restoreAfterFocus.current = null // a field of the previous content does not restore the new one
    if (scroller.current) scroller.current.scrollTop = 0 // new content starts at the top
    const id = setTimeout(() => {
      pending.current = null
    }, PENDING_MS)
    return () => clearTimeout(id)
  }, [contentKey, place])

  useLayoutEffect(() => {
    heightsRef.current = heights
  })

  // Lets the map keep its attribution and focus above the sheet, never under the default height (native).
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--map-bottom-inset', `${Math.min(shown, Math.round(vh * DEFAULT_SHARE))}px`)
  }, [shown, vh])

  // The visible height: `sheetH - y` is exact both at rest and during a drag.
  const visibleNow = sheetH - y
  useLayoutEffect(() => {
    onVisible?.(visibleNow, drag !== null)
  }, [visibleNow, drag, onVisible])

  // Every move the user or the app makes ends a pending target.
  const moveTo = useCallback((px: number) => {
    pending.current = null
    lastPx.current = px
    setVisible(px)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      goTo: (snap, px) => {
        pending.current = { snap, px }
      },
      snapTo: (snap) => moveTo(heightsRef.current[snap]),
      height: () => lastPx.current,
    }),
    [moveTo],
  )

  // Release: a flick moves one height in its direction, otherwise the nearest height wins.
  // `base` and `dropY` are y positions of the sheet top, as the gesture saw them.
  const settle = (base: number, dropY: number, v: number) => {
    const hs = heightsRef.current
    const cur = hs[nearestSnap(hs, sheetH - base)]
    let px: number
    if (Math.abs(v) > VELOCITY) {
      // Negative velocity moves the finger up: the sheet grows to the next height.
      px = v < 0 ? (hs.find((h) => h > cur) ?? cur) : ([...hs].reverse().find((h) => h < cur) ?? cur)
    } else {
      px = hs[nearestSnap(hs, sheetH - dropY)]
    }
    setDrag(null)
    moveTo(px)
  }

  // Hard limits: the sheet stops at its highest and lowest height (native enableOverDrag false).
  const clampY = useCallback((next: number) => Math.min(bottomY, Math.max(topY, next)), [topY, bottomY])

  // Touch: decide per gesture whether it scrolls the content or moves the sheet.
  const gesture = useRef({ y0: 0, x0: 0, t0: 0, base: 0, mode: '' as '' | 'drag' | 'scroll' | 'none' })
  const dragRef = useRef<number | null>(null)
  const baseRef = useRef(0)
  const atFullRef = useRef(false)
  const settleRef = useRef(settle)
  const clampRef = useRef(clampY)
  // Native touch listeners read the latest values through refs.
  useLayoutEffect(() => {
    dragRef.current = drag
    baseRef.current = sheetH - shown
    atFullRef.current = atFull
    settleRef.current = settle
    clampRef.current = clampY
  })

  useEffect(() => {
    const el = sheet.current
    if (!el) return
    const onStart = (e: TouchEvent) => {
      const tt = e.touches[0]
      gesture.current = { y0: tt.clientY, x0: tt.clientX, t0: e.timeStamp, base: baseRef.current, mode: '' }
    }
    const onMove = (e: TouchEvent) => {
      const g = gesture.current
      const tt = e.touches[0]
      const dy = tt.clientY - g.y0
      if (g.mode === '') {
        if (Math.abs(dy) < 8 && Math.abs(tt.clientX - g.x0) < 8) return
        if (Math.abs(dy) < Math.abs(tt.clientX - g.x0)) {
          g.mode = 'none'
          return
        }
        const sc = scroller.current
        const inContent = !!sc && sc.contains(e.target as Node)
        // At full height the content scrolls; from its top, pulling down moves the sheet.
        g.mode = atFullRef.current && inContent && (dy < 0 || (sc?.scrollTop ?? 0) > 0) ? 'scroll' : 'drag'
      }
      if (g.mode !== 'drag') return
      e.preventDefault()
      setDrag(clampRef.current(g.base + dy))
    }
    const onEnd = (e: TouchEvent) => {
      const g = gesture.current
      if (g.mode !== 'drag' || dragRef.current === null) return
      const tt = e.changedTouches[0]
      const v = (tt.clientY - g.y0) / Math.max(1, e.timeStamp - g.t0)
      settleRef.current(g.base, dragRef.current, v)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  // Mouse (desktop): drag anywhere after a clear vertical move; the wheel scrolls the content.
  const mouse = useRef({ y: 0, x: 0, t: 0, base: 0, active: false })
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    mouse.current = { y: e.clientY, x: e.clientX, t: e.timeStamp, base: sheetH - shown, active: true }
  }
  const onPointerMove = (e: PointerEvent) => {
    const m = mouse.current
    if (!m.active) return
    const dy = e.clientY - m.y
    if (drag === null) {
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.clientX - m.x)) return
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setDrag(clampY(m.base + dy))
  }
  const onPointerUp = (e: PointerEvent) => {
    const m = mouse.current
    if (!m.active) return
    m.active = false
    if (drag === null) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    settle(m.base, drag, (e.clientY - m.y) / Math.max(1, e.timeStamp - m.t))
  }

  // A focused text field extends the sheet to full height, and it returns when the field is left
  // (native keyboardBehavior extend and keyboardBlurBehavior restore).
  const onFocus = (e: FocusEvent) => {
    if (!isTextField(e.target)) return
    if (restoreAfterFocus.current === null) restoreAfterFocus.current = shown
    moveTo(heightsRef.current[SNAP.full])
  }
  const onBlur = (e: FocusEvent) => {
    if (!isTextField(e.target) || restoreAfterFocus.current === null) return
    // Focus may hop to another field of the sheet: decide once it has settled.
    setTimeout(() => {
      const back = restoreAfterFocus.current
      if (back === null || sheet.current?.contains(document.activeElement)) return
      restoreAfterFocus.current = null
      const hs = heightsRef.current
      // Only when the user has not moved the sheet since.
      if (lastPx.current === hs[SNAP.full]) moveTo(hs[nearestSnap(hs, back)])
    }, 150)
  }

  return (
    <section
      ref={sheet}
      className={`sheet${drag !== null ? ' dragging' : ''}`}
      style={{ transform: `translate3d(0, ${y}px, 0)`, visibility: sheetH ? 'visible' : 'hidden' }}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div ref={grip} className="sheet-grip">
        <button
          className="sheet-handle"
          aria-label={label}
          aria-expanded={atFull}
          onClick={() => {
            if (drag !== null) return
            // Tap: one height up; from the top back to the panel's default.
            moveTo(heights.find((h) => h > shown) ?? heights[defaultSnap])
          }}
        />
      </div>
      {/* Height follows the snap (not during a drag), so everything below the fold can scroll into view. */}
      <div ref={scroller} className="sheet-scroll" style={{ height: Math.max(0, shown - gripH) }}>
        <div ref={inner}>
          <div className="sheet-peek">{peek}</div>
          {children && <div className="sheet-body">{children}</div>}
        </div>
      </div>
    </section>
  )
})
