import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './BottomSheet.css'

type Props = {
  /** Always-visible part (collapsed state shows exactly this). */
  peek: ReactNode
  /** Revealed when the sheet is pulled up. */
  children?: ReactNode
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  label: string
  /** When this changes (new station, route, line...), a minimized sheet opens again. */
  contentKey?: string
}

const VELOCITY = 0.4 // px/ms that counts as a flick
const MIN_VISIBLE = 88 // px left on screen when minimized: grip + title

/**
 * Draggable bottom sheet. Moves only with transform (60 fps on low-end
 * Android); the spring-like easing lives in CSS and respects reduced motion.
 */
export function BottomSheet({ peek, children, expanded, onExpandedChange, label, contentKey }: Props) {
  const sheet = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const [peekH, setPeekH] = useState(0)
  const [sheetH, setSheetH] = useState(0)
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef({ y: 0, x: 0, t: 0, base: 0, active: false })

  useLayoutEffect(() => {
    const measure = () => {
      setPeekH(peekRef.current?.offsetHeight ?? 0)
      setSheetH(sheet.current?.offsetHeight ?? 0)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (peekRef.current) ro.observe(peekRef.current)
    if (sheet.current) ro.observe(sheet.current)
    return () => ro.disconnect()
  }, [])

  // Three snap points: expanded (0), normal (shows the peek), minimized (title only).
  // Minimized for one piece of content only: new content opens normally.
  const key = contentKey ?? ''
  const [minimizedFor, setMinimizedFor] = useState<string | null>(null)
  const minimized = minimizedFor === key
  const setMinimized = (on: boolean) => setMinimizedFor(on ? key : null)
  const collapsedY = Math.max(0, sheetH - peekH)
  const minY = Math.max(collapsedY, sheetH - MIN_VISIBLE)
  const baseY = expanded ? 0 : minimized ? minY : collapsedY
  const y = drag ?? baseY
  const visible = minimized && !expanded ? MIN_VISIBLE : peekH

  useLayoutEffect(() => {
    // Lets the map keep its attribution above the sheet.
    document.documentElement.style.setProperty('--map-bottom-inset', `${visible}px`)
  }, [visible])

  // The whole sheet is a drag handle. A drag starts only after a clear vertical
  // move, so taps on buttons inside still work; pointer capture begins then.
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      start.current = { y: e.clientY, x: e.clientX, t: e.timeStamp, base: baseY, active: true }
    },
    [baseY],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s0 = start.current
      if (!s0.active) return
      const dy = e.clientY - s0.y
      if (drag === null) {
        if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.clientX - s0.x)) return
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      const next = s0.base + dy
      // Rubber band past the ends.
      setDrag(next < 0 ? next / 4 : next > minY ? minY + (next - minY) / 4 : next)
    },
    [minY, drag],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      start.current.active = false
      if (drag === null) return
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      const dt = Math.max(1, e.timeStamp - start.current.t)
      const v = (e.clientY - start.current.y) / dt
      // Snap to the nearest point; a flick moves one step in its direction.
      const snaps = [0, collapsedY, minY]
      const from = start.current.base
      let target: number
      if (Math.abs(v) > VELOCITY) {
        target = v < 0 ? Math.max(...snaps.filter((p) => p < from - 1), 0) : Math.min(...snaps.filter((p) => p > from + 1), minY)
        if (!Number.isFinite(target)) target = from
      } else {
        target = snaps.reduce((a, b) => (Math.abs(b - drag) < Math.abs(a - drag) ? b : a))
      }
      setDrag(null)
      setMinimizedFor(target === minY && minY > collapsedY ? key : null)
      onExpandedChange(target === 0)
    },
    [collapsedY, minY, drag, onExpandedChange, key],
  )

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
      <div className="sheet-grip">
        <button
          className="sheet-handle"
          aria-label={label}
          aria-expanded={expanded}
          onClick={() => {
            if (drag !== null) return
            if (minimized) setMinimized(false)
            else onExpandedChange(!expanded)
          }}
        />
      </div>
      <div ref={peekRef} className="sheet-peek">
        {peek}
      </div>
      <div className="sheet-body" aria-hidden={!expanded}>
        {children}
      </div>
    </section>
  )
}
