import './StatusBand.css'

/**
 * Small glass pill at the top of the map (native StatusPill): one 8 px dot and one line of text.
 * The warning tone is for service notices; the neutral tone (grey dot) is for the offline notice.
 */
export function StatusPill({ text, tone = 'warning', onPress }: { text: string; tone?: 'warning' | 'neutral'; onPress: () => void }) {
  return (
    <button className="status-pill" onClick={onPress} aria-label={text}>
      <span className={`status-dot ${tone}`} aria-hidden />
      <span className="status-text">{text}</span>
    </button>
  )
}
