import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { stopTimes } from '../lib/api'
import { groupDepartures, type DepartureGroup } from '../lib/departures'
import { loadLines, type Line } from '../lib/data'
import { hhmm } from '../lib/itinerary'
import { CITY, liveStop } from '../lib/city'
import type { Station } from '../map/networkLayer'
import { LiveArrivals } from '../components/LiveArrivals'
import { StopCode } from '../components/StopCode'
import { stopCode } from '../lib/city'
import { t } from '../i18n'
import { Skeleton } from '../components/Skeleton'
import './StationSheet.css'

const REFRESH_MS = 30_000

/** Google Maps-like station card: lines, directions button, next arrivals per line and direction. */
export function StationSheet({
  station,
  onDirections,
  onClose,
  onLine,
}: {
  station: Station
  onDirections: () => void
  onClose: () => void
  onLine: (id: string) => void
}) {
  const [lines, setLines] = useState<Map<string, Line>>(new Map())
  const [groups, setGroups] = useState<{ id: string; list: DepartureGroup[] | null; error: boolean; at: number }>({
    id: '',
    list: null,
    error: false,
    at: 0,
  })

  useEffect(() => {
    loadLines().then((ls) => setLines(new Map(ls.map((l) => [l.id, l]))), () => {})
  }, [])

  // Ankara and Bursa bus stops have a live board (EGO, BURULAŞ); it comes first and the timetable follows it.
  const boardStop = liveStop(station.id)
  const timetable = CITY.routing

  useEffect(() => {
    if (!timetable) return
    let alive = true
    const load = () =>
      stopTimes(CITY.motisPrefix + station.id, new Date(), 40).then(
        (st) => alive && setGroups({ id: station.id, list: groupDepartures(st), error: false, at: Date.now() }),
        () => alive && setGroups({ id: station.id, list: null, error: true, at: Date.now() }),
      )
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [station.id, timetable])

  const current = groups.id === station.id ? groups : null

  return (
    <div className="station">
      <div className="station-head">
        <div className="station-title">
          <h2>
            {station.name}
            <StopCode code={stopCode(station.id)} />
          </h2>
          <div className="chips wrap">
            {station.lines.map((id) => {
              const l = lines.get(id)
              return (
                <button key={id} className="chip-btn" onClick={() => onLine(id)} aria-label={`${l?.name ?? id} ${t('lines')}`}>
                  <LineChip name={l?.name ?? id} line={l} />
                </button>
              )
            })}
          </div>
        </div>
        <button className="close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      {CITY.routing && (
        <button className="directions" onClick={onDirections}>
          <Icon name="route" size={20} />
          {t('directions')}
        </button>
      )}

      {boardStop && <LiveArrivals stop={boardStop} stopId={station.id} lines={lines} onLine={onLine} />}
      {!CITY.routing && !boardStop && <p aria-live="polite" className="state-msg">{t('routingSoonAnkara')}</p>}
      {timetable && <h3 className="station-sub">{t('nextArrivals')}</h3>}
      {timetable && !current && <Skeleton rows={3} height={56} />}
      {current?.error && <p aria-live="polite" className="state-msg">{t('routingUnavailable')}</p>}
      {current?.list && current.list.length === 0 && <p aria-live="polite" className="state-msg">{t('noDepartures')}</p>}
      <ul className="dep-groups">
        {current?.list?.map((g) => (
          <li key={g.line + g.headsign} className="dep-group">
            <LineChip name={g.line} color={g.color} textColor={g.textColor} line={g.color ? undefined : [...lines.values()].find((l) => l.name === g.line)} />
            <span className="dep-head">{g.headsign}</span>
            <span className="dep-times">
              {g.times.map((x, i) => {
                const mins = Math.round((x.at.getTime() - current.at) / 60000)
                return (
                  <span key={i} className={i === 0 ? 'first' : ''}>
                    {mins <= 0 ? t('now') : mins <= 60 ? `${mins} ${t('min')}` : hhmm(x.at)}
                  </span>
                )
              })}
            </span>
          </li>
        ))}
      </ul>
      {current?.list && current.list.length > 0 &&
        (current.list.some((g) => g.times.some((x) => x.live)) ? (
          <p className="small-note live-text">
            <span className="live-icon" aria-hidden><Icon name="signal" size={12} /></span>
            {t('live')}
          </p>
        ) : (
          <p className="muted small-note">{t('scheduledNote')}</p>
        ))}
    </div>
  )
}
