import { t } from '../i18n'
import type { Crowding } from '../lib/live'
import './CrowdBadge.css'

const BARS: Record<Crowding, number> = { low: 1, medium: 2, high: 3 }
const WORD = { low: 'crowdLow', medium: 'crowdMedium', high: 'crowdHigh' } as const

/**
 * Bursa crowding estimate: the word above a small bus with one, two or three filled bars
 * (green, amber, red). An estimate from card taps this trip, so the word is always shown too.
 */
export function CrowdBadge({ level }: { level: Crowding }) {
  const n = BARS[level]
  return (
    <span className={`crowd crowd-${level}`} role="img" aria-label={`${t(WORD[level])}, ${t('crowdEstimate')}`}>
      <span className="crowd-word">{t(WORD[level])}</span>
      <svg width="30" height="20" viewBox="0 0 30 20" aria-hidden="true">
        <rect x="1" y="1" width="28" height="14" rx="3.5" className="crowd-body" />
        <rect x="5" y="15.5" width="5" height="3.5" rx="1.5" className="crowd-wheel" />
        <rect x="20" y="15.5" width="5" height="3.5" rx="1.5" className="crowd-wheel" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={6 + i * 7}
            y={11 - (i + 1) * 2.4}
            width="4.5"
            height={(i + 1) * 2.4 + 1}
            rx="1"
            className={i < n ? 'crowd-bar on' : 'crowd-bar'}
          />
        ))}
      </svg>
    </span>
  )
}
