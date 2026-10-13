import type { Itinerary } from '../lib/api'
import { hhmm } from '../lib/itinerary'
import type { TrackState } from '../lib/route'
import { Icon } from './Icon'
import { LineChip } from './LineChip'
import { useNow } from '../lib/useNow'
import { t } from '../i18n'
import './TrackingBanner.css'

/** The next step, big, at the top of the map while "Başla" is on. */
export function TrackingBanner({ it, state, onStop }: { it: Itinerary; state: TrackState; onStop: () => void }) {
  const now = useNow(1000)
  const leg = it.legs[state.leg]
  let title = t('arrived')
  let sub = ''
  if (!state.arrived && leg) {
    if (leg.mode === 'WALK') {
      title = `${t('walkNow')} ${leg.to.name === 'END' ? t('destination') : leg.to.name}`
      sub = `${Math.max(1, Math.round(leg.duration / 60))} ${t('min')} · ${hhmm(new Date(leg.endTime))}`
    } else if (now < Date.parse(leg.startTime) - 30_000) {
      // At (or walking to) the stop, the ride has not left yet.
      title = `${t('boardAt')} ${leg.from.name}`
      sub = `${leg.routeShortName ?? ''}${leg.headsign ? ` · ${leg.headsign} ${t('direction')}` : ''} · ${hhmm(new Date(leg.startTime))}`
    } else if (state.getOffNext) {
      title = t('getOffNext')
      sub = leg.to.name
    } else {
      title = `${t('getOffAt')} ${leg.to.name}`
      sub = `${leg.headsign ? `${leg.headsign} ${t('direction')} · ` : ''}${hhmm(new Date(leg.endTime))}`
    }
  }
  const warn = !state.arrived && state.getOffNext
  return (
    <section className={warn ? 'tracking warn' : 'tracking'} aria-live="polite">
      {leg && leg.mode !== 'WALK' && !state.arrived ? (
        <LineChip name={leg.routeShortName ?? leg.mode} color={leg.routeColor} textColor={leg.routeTextColor} />
      ) : (
        <Icon name={state.arrived ? 'pin' : 'walk'} size={26} />
      )}
      <div className="tracking-text">
        <strong className="tracking-title">{title}</strong>
        {sub && <span className="tracking-sub">{sub}</span>}
      </div>
      <button className="tracking-stop" onClick={onStop} aria-label={t('stop')}>
        ×
      </button>
    </section>
  )
}
