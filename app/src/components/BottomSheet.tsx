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
  const start = useRef({ y: 0, t: 0, base: 0, lastY: 0, lastT: 0 })

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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      start.current = { y: e.clientY, t: e.timeStamp, base: baseY, lastY: e.clientY, lastT: e.timeStamp }
    },
    [baseY],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      const dy = e.clientY - start.current.y
      if (drag === null && Math.abs(dy) < 6) return
      start.current.lastY = e.clientY
      start.current.lastT = e.timeStamp
      const next = start.current.base + dy
      // Rubber band past the ends.
      setDrag(next < 0 ? next / 4 : next > collapsedY ? collapsedY + (next - collapsedY) / 4 : next)
    },
    [collapsedY, drag],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      if (drag === null) return
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
    >
      <div
        className="sheet-grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
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
