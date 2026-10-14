import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { DepartureLine, ProblemLine } from '../components/DepartureLine'
import { Icon } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { RouteChain } from '../components/RouteChain'
import { stopTimes, type Itinerary, type Leg } from '../lib/api'
import { hhmm } from '../lib/itinerary'
import { chain, headwayMinutes } from '../lib/route'
import { problemsOf } from '../lib/status'
import { t } from '../i18n'
import './RouteDetail.css'

type Props = {
  it: Itinerary
  fromName: string
  toName: string
  liveCount: number
  /** The trip is followed on the map: the button stops it. */
  tracking: boolean
  problemLines: string[]
  /** "Başla": follow the trip on the map (the user asked for it, so alerts may be asked for now). */
  onStart: () => void
  onBack: () => void
  onClose: () => void
}

/** One itinerary step by step (native RouteDetail): the chain, the next ride, live vehicles, start, then the steps. */
export function RouteDetail({ it, fromName, toName, liveCount, tracking, problemLines, onStart, onBack, onClose }: Props) {
  const minutes = Math.round(it.duration / 60)
  const firstRideIdx = it.legs.findIndex((l) => l.mode !== 'WALK')
  const problems = problemsOf(it, problemLines)
  return (
    <div className="detail">
      <div className="detail-head">
        <button className="detail-round" onClick={onBack} aria-label={t('back')}>
          <Icon name="back" size={18} />
        </button>
        <span className="detail-ends">
          {fromName} → {toName}
        </span>
        <button className="detail-round" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="detail-top">
        <span className="detail-min">
          {minutes} <small>{t('min')}</small>
        </span>
        <span className="detail-arrival">
          {t('arrival')} {hhmm(new Date(it.endTime))}
        </span>
      </div>
      <RouteChain items={chain(it)} />
      {problems.length ? <ProblemLine lines={problems} /> : <DepartureLine it={it} />}
      {liveCount > 0 && (
        <p className="live-row">
          <span className="live-icon" aria-hidden>
            <Icon name="signal" size={13} />
          </span>
          {liveCount} {t('liveVehicles')}
        </p>
      )}
      <Button label={tracking ? t('stop') : t('start')} icon="navigate" primary={!tracking} onClick={onStart} />

      <div className="timeline">
        {it.legs.map((leg, i) => (
          <Step key={i} leg={leg} first={i === 0} withHeadway={i === firstRideIdx} />
        ))}
        <Node time={hhmm(new Date(it.endTime))} name={toName} color="#ff3b30" />
      </div>
    </div>
  )
}

/** A stop on the timeline: time, a ring node on the rail, the name. */
function Node({ time, name, color }: { time: string; name: string; color: string }) {
  return (
    <div className="tl-node-row">
      <span className="tl-time">{time}</span>
      <div className="tl-rail">
        <span className="tl-node" style={{ borderColor: color }} />
      </div>
      <span className="tl-name">{name}</span>
    </div>
  )
}

/** One leg: its start node, then the body with a rail (a bar in the line colour, or dots for a walk) and the detail. */
function Step({ leg, first, withHeadway }: { leg: Leg; first: boolean; withHeadway: boolean }) {
  const walk = leg.mode === 'WALK'
  // A short walk between two rides (a change inside a station) gets no block of its own (native).
  if (walk && !first && leg.duration < 60) return null
  const lineColor = leg.routeColor ? `#${leg.routeColor}` : 'var(--accent)'
  const fromName = first && walk ? t('myLocation') : leg.from.name
  return (
    <div className="tl-step">
      <Node time={hhmm(new Date(leg.startTime))} name={fromName} color={walk ? 'var(--accent)' : lineColor} />
      <div className="tl-body">
        <div className="tl-time-space" />
        <div className="tl-rail">
          {walk ? (
            <div className="tl-dots">
              {Array.from({ length: 5 }, (_, k) => (
                <span key={k} className="tl-dot" />
              ))}
            </div>
          ) : (
            <span className="tl-bar" style={{ background: lineColor }} />
          )}
        </div>
        <div className="tl-detail">{walk ? <WalkDetail leg={leg} /> : <Ride leg={leg} withHeadway={withHeadway} />}</div>
      </div>
    </div>
  )
}

function WalkDetail({ leg }: { leg: Leg }) {
  const min = Math.max(1, Math.round(leg.duration / 60))
  return (
    <div className="tl-walk">
      <Icon name="walk" size={15} />
      <span className="tabular">
        {min} {t('min')} {t('walk')}
        {leg.distance ? ` · ${Math.round(leg.distance / 10) * 10} m` : ''}
      </span>
    </div>
  )
}

function Ride({ leg, withHeadway }: { leg: Leg; withHeadway: boolean }) {
  const headway = useHeadway(leg, withHeadway)
  const stops = (leg.intermediateStops?.length ?? 0) + 1
  const meta = [`${stops} ${t('stops')}`, `${Math.round(leg.duration / 60)} ${t('min')}`, headway ? `${t('every')} ${headway} ${t('everyMin')}` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="tl-ride">
      <div className="tl-ride-head">
        <LineChip name={leg.routeShortName ?? leg.mode} color={leg.routeColor} textColor={leg.routeTextColor} />
        {leg.headsign ? <span className="tl-headsign">{`${leg.headsign} ${t('direction')}`}</span> : null}
      </div>
      <div className="tl-meta tabular">{meta}</div>
      <div className={leg.realTime ? 'tl-status live' : 'tl-status'}>
        {leg.realTime && (
          <span className="live-icon" aria-hidden>
            <Icon name="signal" size={12} />
          </span>
        )}
        {leg.realTime ? t('live') : t('scheduled')}
      </div>
    </div>
  )
}

/** Typical gap between this line's departures at the boarding stop (native: the first ride only). */
function useHeadway(leg: Leg, enabled: boolean): number | null {
  const [headway, setHeadway] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled || !leg.from.stopId) return
    let alive = true
    stopTimes(leg.from.stopId, new Date(leg.startTime), 30).then(
      (st) => {
        if (!alive) return
        const same = st.filter((s) => s.routeShortName === leg.routeShortName && (!leg.headsign || s.headsign === leg.headsign))
        setHeadway(headwayMinutes(same.map((s) => new Date(s.place.departure ?? s.place.arrival ?? ''))))
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [leg, enabled])
  return headway
}
