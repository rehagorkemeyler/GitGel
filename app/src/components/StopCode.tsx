import './StopCode.css'

/** Small stop-number badge: many Ankara stops share a name ("Kızılay" x 20). */
export function StopCode({ code }: { code: string | null | undefined }) {
  if (!code) return null
  return <span className="stop-code">{code}</span>
}
