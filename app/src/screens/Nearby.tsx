import { useEffect, useState } from 'react'
import { PanelHeader } from '../components/PanelHeader'
import { LineChip } from '../components/LineChip'
import { Icon } from '../components/Icon'
import { Skeleton } from '../components/Skeleton'
import { stopTimes, type StopTime } from '../lib/api'
import { CITY } from '../lib/city'
import { loadStops, lineColors, type Line } from '../lib/data'
import { walkMinutes } from '../lib/geo'
import { hhmm } from '../lib/itinerary'
import { nearestStops, type NearbyStop } from '../lib/nearby'
import { minutesUntil, nearbyDepartures } from '../lib/nearbyDepartures'
import type { Status } from '../lib/live'
import type { Station } from '../map/networkLayer'
import { t } from '../i18n'
import './Nearby.css'

// Next departures load right away for the closest stops only (native AUTO_DEPARTURES).
const AUTO_DEPARTURES = 5

type Props = {
  position: [number, number] | null
  /** Service problems: their departures are hidden (product rule). */
  status: Status | null
  onLocate: () => void
  /** A stop card opens, and the map flies there (native onStation). */
  onStation: (st: Station) => void
  onBack: () => void
}

/** Nearby stops as cards (native Nearby.tsx): a tap opens the stop card; the five closest show next departures. */
export function Nearby({ position, status, onLocate, onStation, onBack }: Props) {
  const [stops, setStops] = useState<NearbyStop[] | null>(null)
  const [error, setError] = useState(false)
  const [colors, setColors] = useState<Map<string, Line>>(new Map())
  const [lineById, setLineById] = useState<Map<string, Line>>(new Map())

  useEffect(() => {
    lineColors().then((m) => {
      setColors(m)
      setLineById(new Map([...m.values()].map((l) => [l.id, l])))
    }, () => {})
  }, [])

  useEffect(() => {
    if (!position) return
    loadStops().then(
      (all) => setStops(nearestStops(all, position[1], position[0])),
      () => setError(true),
    )
  }, [position])

  return (
    <>
      <PanelHeader title={t('nearbyTitle')} onClose={onBack} />
      {!position && (
        <div className="empty">
          <p aria-live="polite" className="state-msg">
            {t('nearbyNeedsLocation')}
          </p>
          <button className="locate-button" onClick={onLocate}>
            <Icon name="navigate" size={20} />
            <span>{t('locateMe')}</span>
          </button>
        </div>
      )}
      {position && !stops && !error && <Skeleton rows={4} height={64} />}
      {error && (
        <p aria-live="polite" className="state-msg">
          {t('dataUnavailable')}
        </p>
      )}
      {position && stops && stops.length === 0 && (
        <p aria-live="polite" className="state-msg">
          {t('nothingNearby')}
        </p>
      )}
      <ul className="nearby-list">
        {stops?.map((s, i) => (
          <li key={s.id}>
            <button className="stop-card" onClick={() => onStation({ ...s, ids: [s.id] })}>
              <span className="stop-card-row">
                <span className="stop-card-text">
                  <span className="stop-card-name">{s.name}</span>
                  <span className="nearby-chips">
                    {s.lines.slice(0, 6).map((id) => {
                      const l = lineById.get(id)
                      return <LineChip key={id} name={l?.name ?? id.toUpperCase()} line={l} />
                    })}
                  </span>
                </span>
                <span className="distance">
                  <span>
                    {walkMinutes(s.distance)} {t('min')}
                  </span>
                  <small>{Math.round(s.distance / 10) * 10} m</small>
                </span>
              </span>
              {i < AUTO_DEPARTURES && <NextDepartures stopId={s.id} status={status} colors={colors} />}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/** The next three departures of a stop, under its card (native NextDepartures). Spans only: this sits inside the card button. */
function NextDepartures({ stopId, status, colors }: { stopId: string; status: Status | null; colors: Map<string, Line> }) {
  const [list, setList] = useState<{ at: number; items: StopTime[] } | null>(null)
  useEffect(() => {
    let alive = true
    stopTimes(CITY.motisPrefix + stopId, new Date(), 6).then(
      (r) => {
        if (alive) setList({ at: Date.now(), items: nearbyDepartures(r, status) })
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [stopId, status])
  if (!list || !list.items.length) return null
  const live = list.items.some((d) => d.realTime)
  return (
    <span className="deps">
      {list.items.map((d, i) => {
        const at = new Date(d.place.departure ?? d.place.arrival ?? '')
        const mins = minutesUntil(at, list.at)
        const name = d.routeShortName ?? ''
        return (
          <span key={i} className="dep">
            <LineChip name={name} color={d.routeColor} textColor={d.routeTextColor} line={d.routeColor ? undefined : colors.get(name)} />
            <span className="dep-head">{d.headsign}</span>
            <span className={d.realTime ? 'dep-time live-text' : 'dep-time'}>{mins <= 60 ? `${mins} ${t('min')}` : hhmm(at)}</span>
          </span>
        )
      })}
      <span className={live ? 'deps-foot live-text' : 'deps-foot'}>
        {live && (
          <span className="live-icon" aria-hidden="true">
            <Icon name="signal" size={13} />
          </span>
        )}
        {live ? t('live') : t('scheduled')}
      </span>
    </span>
  )
}
