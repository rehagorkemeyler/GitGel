import './Skeleton.css'

/** Calm loading placeholder rows (native Skeleton). Pulses in CSS; still when motion is reduced. */
export function Skeleton({
  rows = 3,
  height = 52,
  label = '…',
}: {
  rows?: number
  height?: number
  label?: string
}) {
  return (
    <div className="skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" style={{ height }}>
          <span className="skeleton-circle" />
          <span className="skeleton-lines">
            <span className="skeleton-line" style={{ width: `${70 - i * 12}%` }} />
            <span className="skeleton-line short" />
          </span>
        </div>
      ))}
    </div>
  )
}
