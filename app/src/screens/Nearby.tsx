import { useEffect, useState } from 'react'
import { Panel } from '../components/Panel'
import { LineChip } from '../components/LineChip'
import { loadStops, lineColors, type Line } from '../lib/data'
import { nearestStops, type NearbyStop } from '../lib/nearby'
import { walkMinutes } from '../lib/geo'
import { stopTimes, type StopTime } from '../lib/api'
import { hhmm } from '../lib/itinerary'
import { MOTIS_STOP_PREFIX } from '../lib/config'
import { t } from '../i18n'
import './Nearby.css'

type Props = {
  position: [number, number] | null
  onLocate: () => void
  onBack: () => void
}

export function Nearby({ position, onLocate, onBack }: Props) {
  const [stops, setStops] = useState<NearbyStop[] | null>(null)
  const [error, setError] = useState(false)
  const [colors, setColors] = useState<Map<string, Line>>(new Map())
  const [lineById, setLineById] = useState<Map<string, Line>>(new Map())
  const [open, setOpen] = useState<string | null>(null)

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
    <Panel title={t('nearby')} onBack={onBack}>
      {!position && (
        <div className="empty">
          <p className="muted">{t('nearbyNeedsLocation')}</p>
          <button className="retry" onClick={onLocate}>
            {t('locateMe')}
          </button>
        </div>
      )}
      {error && <p className="muted">{t('dataUnavailable')}</p>}
      {position && stops && stops.length === 0 && <p className="muted">{t('nothingNearby')}</p>}
      <ul className="results">
        {stops?.map((s) => (
          <li key={s.id}>
            <button className="result" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
              <span className="result-text">
                <span className="result-name">{s.name}</span>
                <span className="chips">
                  {s.lines.slice(0, 6).map((id) => {
                    const l = lineById.get(id)
                    return <LineChip key={id} name={l?.name ?? id} line={l ?? colors.get(id)} />
                  })}
                </span>
              </span>
              <span className="distance">
                {walkMinutes(s.distance)} {t('min')}
                <small>{Math.round(s.distance / 10) * 10} m</small>
              </span>
            </button>
            {open === s.id && <Departures stopId={MOTIS_STOP_PREFIX + s.id} colors={colors} />}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Departures({ stopId, colors }: { stopId: string; colors: Map<string, Line> }) {
  const [list, setList] = useState<StopTime[] | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    stopTimes(stopId, new Date(), 8).then(
      (r) => {
        if (!alive) return
        setFetchedAt(Date.now())
        setList(r)
      },
      () => alive && setError(true),
    )
    return () => {
      alive = false
    }
  }, [stopId])
  if (error) return <p className="muted departures">{t('routingUnavailable')}</p>
  if (!list) return <p className="muted departures">…</p>
  if (list.length === 0) return <p className="muted departures">{t('noDepartures')}</p>
  const now = fetchedAt
  return (
    <ul className="departures">
      {list.map((d, i) => {
        const at = new Date(d.place.departure ?? '')
        const mins = Math.max(0, Math.round((at.getTime() - now) / 60000))
        return (
          <li key={i}>
            <LineChip name={d.routeShortName ?? ''} line={colors.get(d.routeShortName ?? '')} />
            <span className="dep-head">{d.headsign}</span>
            <span className="dep-time">
              {mins <= 60 ? `${mins} ${t('min')}` : hhmm(at)}
              <small className={d.realTime ? 'live-text' : ''}>{d.realTime ? t('live') : t('scheduled')}</small>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
