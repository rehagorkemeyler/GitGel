import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { stopTimes, type Itinerary, type Leg } from '../lib/api'
import { hhmm } from '../lib/itinerary'
import { t } from '../i18n'
import './RouteDetail.css'

/** Step-by-step view of one itinerary; the map shows it at the same time. */
export function RouteDetail({ it, onBack }: { it: Itinerary; onBack: () => void }) {
  const minutes = Math.round(it.duration / 60)
  return (
    <div className="detail">
      <div className="detail-head">
        <button className="panel-back" onClick={onBack} aria-label={t('back')}>
          <Icon name="back" />
        </button>
        <div>
          <div className="detail-min">
            {minutes} {t('min')}
          </div>
          <div className="muted">
            {hhmm(new Date(it.startTime))} – {hhmm(new Date(it.endTime))}
          </div>
        </div>
      </div>
      <ol className="steps">
        {it.legs.map((leg, i) => (
          <li key={i} className="step">
            {leg.mode === 'WALK' ? <WalkStep leg={leg} /> : <RideStep leg={leg} first={it.legs.findIndex((l) => l.mode !== 'WALK') === i} />}
          </li>
        ))}
      </ol>
    </div>
  )
}

function WalkStep({ leg }: { leg: Leg }) {
  const min = Math.max(1, Math.round(leg.duration / 60))
  return (
    <div className="step-walk">
      <Icon name="walk" size={18} />
      <span>
        {min} {t('min')} {t('walkTo')} {leg.to.name === 'END' ? t('destination') : leg.to.name}
        {leg.distance ? ` · ${Math.round(leg.distance / 10) * 10} m` : ''}
      </span>
    </div>
  )
}

function RideStep({ leg, first }: { leg: Leg; first: boolean }) {
  const stops = (leg.intermediateStops?.length ?? 0) + 1
  const color = leg.routeColor ? `#${leg.routeColor}` : 'var(--text-2)'
  return (
    <div className="step-ride" style={{ borderColor: color }}>
      <div className="ride-line">
        <LineChip name={leg.routeShortName ?? leg.mode} color={leg.routeColor} textColor={leg.routeTextColor} />
        {leg.headsign && (
          <span className="muted">
            {leg.headsign} {t('direction')}
          </span>
        )}
      </div>
      <div className="ride-stop">
        <strong>{hhmm(new Date(leg.startTime))}</strong> {leg.from.name}
      </div>
      <div className="muted">
        {stops} {t('stops')} · {Math.round(leg.duration / 60)} {t('min')} ·{' '}
        <span className={leg.realTime ? 'live-text' : ''}>{leg.realTime ? t('live') : t('scheduled')}</span>
      </div>
      <div className="ride-stop">
        <strong>{hhmm(new Date(leg.endTime))}</strong> {leg.to.name}
      </div>
      {first && <NextDepartures leg={leg} />}
    </div>
  )
}

/** Later departures of the same line from the boarding stop. */
function NextDepartures({ leg }: { leg: Leg }) {
  const [times, setTimes] = useState<Date[] | null>(null)
  useEffect(() => {
    if (!leg.from.stopId) return
    let alive = true
    const after = new Date(new Date(leg.startTime).getTime() + 60_000)
    stopTimes(leg.from.stopId, after, 30).then(
      (st) =>
        alive &&
        setTimes(
          st
            .filter((s) => s.routeShortName === leg.routeShortName && (!leg.headsign || s.headsign === leg.headsign))
            .slice(0, 3)
            .map((s) => new Date(s.place.departure ?? '')),
        ),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [leg])
  if (!times || times.length === 0) return null
  return (
    <div className="muted next">
      {t('nextDepartures')}: {times.map(hhmm).join(', ')}
    </div>
  )
}
