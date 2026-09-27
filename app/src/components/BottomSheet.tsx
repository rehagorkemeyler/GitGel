import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './BottomSheet.css'

type Props = {
  /** Main content (search, station card, route list...). */
  peek: ReactNode
  /** More content below the main part (line page stops). */
  children?: ReactNode
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  label: string
  /** When this changes (new station, route, line...), the sheet opens at its default height again. */
  contentKey?: string
}

const VELOCITY = 0.4 // px/ms that counts as a flick
const MIN_VISIBLE = 88 // px left on screen when minimized: grip + title
const DEFAULT_SHARE = 0.4 // default height: the content, but at most 40% of the screen
const MID_SHARE = 0.65
const FIT_SHARE = 0.5 // content up to half the screen opens whole

// Snap indexes, lowest to highest.
const MIN = 0
const DEFAULT = 1
const MID = 2
const FULL = 3

/**
 * Draggable bottom sheet with four heights: minimized, default (content up to
 * 40% of the screen), middle and full. Heights taller than the content are
 * skipped, so a short menu never opens onto an empty screen. The content
 * scrolls inside at full height; from the top of the content a downward drag
 * moves the sheet again, anywhere on the sheet.
 *
 * Moves only with transform (60 fps on low-end Android); the spring-like easing
 * lives in CSS and respects reduced motion.
 */
export function BottomSheet({ peek, children, expanded, onExpandedChange, label, contentKey }: Props) {
  const sheet = useRef<HTMLElement>(null)
  const grip = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ sheetH: 0, gripH: 0, contentH: 0, vh: typeof window !== 'undefined' ? window.innerHeight : 800 })
  const [drag, setDrag] = useState<number | null>(null)

  useLayoutEffect(() => {
    const measure = () =>
      setDims({
        sheetH: sheet.current?.offsetHeight ?? 0,
        gripH: grip.current?.offsetHeight ?? 0,
        contentH: inner.current?.offsetHeight ?? 0,
        vh: window.innerHeight,
      })
    measure()
    const ro = new ResizeObserver(measure)
    for (const el of [sheet.current, inner.current]) if (el) ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // Visible height of each snap, lowest first; heights above what the content needs collapse down.
  const { sheetH, gripH, contentH, vh } = dims
  const need = Math.min(sheetH, gripH + contentH)
  const heights = [
    Math.min(MIN_VISIBLE, need),
    // Short content (the home menu) is shown whole; long content (a stop, route results) at 40%.
    need <= vh * FIT_SHARE ? need : Math.round(vh * DEFAULT_SHARE),
    Math.min(need, Math.round(vh * MID_SHARE)),
    need,
  ].map((h, i, a) => Math.max(h, i ? a[i - 1] : 0))

  // Snap per content: new content opens at the default height.
  const key = contentKey ?? ''
  const [snapState, setSnapState] = useState({ key, snap: DEFAULT })
  const own = snapState.key === key ? snapState.snap : DEFAULT
  // The parent can ask for full height (expanded) or give it back.
  const snap = expanded ? FULL : own === FULL ? DEFAULT : own
  const setSnap = useCallback(
    (s: number) => {
      setSnapState({ key, snap: s })
      onExpandedChange(s === FULL)
    },
    [key, onExpandedChange],
  )
  // Closing a route or opening a stop: tell the parent it is no longer expanded.
  useEffect(() => {
    if (expanded && snapState.key !== key) onExpandedChange(false)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = heights[snap]
  const y = drag ?? sheetH - visible
  const topY = sheetH - heights[FULL]
  const bottomY = sheetH - heights[MIN]

  useLayoutEffect(() => {
    // Lets the map keep its attribution above the sheet.
    document.documentElement.style.setProperty('--map-bottom-inset', `${Math.min(visible, heights[DEFAULT])}px`)
  }, [visible, heights[DEFAULT]]) // eslint-disable-line react-hooks/exhaustive-deps

  // New content starts scrolled to the top.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [key])

  // Release: a flick moves one height in its direction, otherwise the nearest height wins.
  const settle = useCallback(
    (fromY: number, atY: number, v: number) => {
      const nearest = (visibleH: number) =>
        heights.reduce((best, h, i) => (Math.abs(h - visibleH) < Math.abs(heights[best] - visibleH) ? i : best), 0)
      let target: number
      if (Math.abs(v) > VELOCITY) {
        const cur = heights[nearest(sheetH - fromY)]
        const up = heights.findIndex((h) => h > cur)
        const down = heights.map((h, i) => (h < cur ? i : -1)).filter((i) => i >= 0).pop()
        target = v < 0 ? (up === -1 ? nearest(cur) : up) : (down ?? nearest(cur))
      } else {
        target = nearest(sheetH - atY)
      }
      // Several snaps can share a height (short content): keep the lowest of them.
      setDrag(null)
      setSnap(heights.indexOf(heights[target]))
    },
    [heights, sheetH, setSnap], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const clampY = useCallback(
    (next: number) => (next < topY ? topY - (topY - next) / 4 : next > bottomY ? bottomY + (next - bottomY) / 4 : next),
    [topY, bottomY],
  )

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
    baseRef.current = sheetH - visible
    atFullRef.current = visible >= heights[FULL] && heights[FULL] > heights[MID]
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
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    mouse.current = { y: e.clientY, x: e.clientX, t: e.timeStamp, base: sheetH - visible, active: true }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const m = mouse.current
    if (!m.active) return
    const dy = e.clientY - m.y
    if (drag === null) {
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.clientX - m.x)) return
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setDrag(clampY(m.base + dy))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const m = mouse.current
    if (!m.active) return
    m.active = false
    if (drag === null) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    settle(m.base, drag, (e.clientY - m.y) / Math.max(1, e.timeStamp - m.t))
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
    >
      <div ref={grip} className="sheet-grip">
        <button
          className="sheet-handle"
          aria-label={label}
          aria-expanded={expanded}
          onClick={() => {
            if (drag !== null) return
            // Tap: one step up, from the top back to the default height.
            const next = heights.findIndex((h) => h > visible)
            setSnap(next === -1 ? DEFAULT : next)
          }}
        />
      </div>
      {/* Height follows the snap (not during a drag), so everything below the fold can scroll into view. */}
      <div ref={scroller} className="sheet-scroll" style={{ height: Math.max(0, visible - gripH) }}>
        <div ref={inner}>
          <div className="sheet-peek">{peek}</div>
          {children && <div className="sheet-body">{children}</div>}
        </div>
      </div>
    </section>
  )
}
