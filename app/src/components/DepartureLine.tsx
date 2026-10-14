import type { Itinerary } from '../lib/api'
import { hhmm } from '../lib/itinerary'
import { firstRide, leaveInMinutes } from '../lib/route'
import { t } from '../i18n'
import { useNow } from '../lib/useNow'
import { Icon } from './Icon'
import './DepartureLine.css'

/** The next ride with its leave-in countdown, refreshed every 15 s (native DepartureLine). Live is green with the signal glyph. */
export function DepartureLine({ it }: { it: Itinerary }) {
  const now = useNow(15_000)
  const ride = firstRide(it)
  if (!ride) return null
  const live = !!ride.realTime
  const leave = leaveInMinutes(it, now)
  const text = `${ride.routeShortName ?? ''} ${hhmm(new Date(ride.startTime))} ${t('leavesAt')} · ${
    leave <= 0 ? t('leaveNowShort') : `${leave} ${t('min')} ${t('leaveIn')}`
  }`
  return (
    <div className={live ? 'dep-line live' : 'dep-line'}>
      {live && (
        <span className="live-icon" aria-hidden>
          <Icon name="signal" size={13} />
        </span>
      )}
      <span className="dep-line-text">{text}</span>
      {!live && <span className="dep-line-tag">{t('scheduled')}</span>}
    </div>
  )
}

/** Calm notice in place of a countdown for a disrupted line (native ProblemLine). */
export function ProblemLine({ lines }: { lines: string[] }) {
  return (
    <div className="problem-line">
      <span>
        {lines.join(', ')} · {t('serviceNotice')}
      </span>
    </div>
  )
}
