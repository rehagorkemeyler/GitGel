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
}

const VELOCITY = 0.4 // px/ms that counts as a flick

/**
 * Draggable bottom sheet. Moves only with transform (60 fps on low-end
 * Android); the spring-like easing lives in CSS and respects reduced motion.
 */
export function BottomSheet({ peek, children, expanded, onExpandedChange, label }: Props) {
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

  const collapsedY = Math.max(0, sheetH - peekH)
  const baseY = expanded ? 0 : collapsedY
  const y = drag ?? baseY

  useLayoutEffect(() => {
    // Lets the map keep its attribution above the sheet.
    document.documentElement.style.setProperty('--map-bottom-inset', `${peekH}px`)
  }, [peekH])

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
      setDrag(next < 0 ? next / 4 : next > collapsedY ? collapsedY + (next - collapsedY) / 4 : next)
    },
    [collapsedY, drag],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      start.current.active = false
      if (drag === null) return
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      const dt = Math.max(1, e.timeStamp - start.current.t)
      const v = (e.clientY - start.current.y) / dt
      const open = Math.abs(v) > VELOCITY ? v < 0 : drag < collapsedY / 2
      setDrag(null)
      onExpandedChange(open)
    },
    [collapsedY, drag, onExpandedChange],
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
          onClick={() => drag === null && onExpandedChange(!expanded)}
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
