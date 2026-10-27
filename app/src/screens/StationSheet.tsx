import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { LiveArrivals } from '../components/LiveArrivals'
import { PanelHeader } from '../components/PanelHeader'
import { Skeleton } from '../components/Skeleton'
import { StopCode } from '../components/StopCode'
import { stopTimes } from '../lib/api'
import { CITY, liveStop, stopCode } from '../lib/city'
import { loadLines, loadStops, type Line } from '../lib/data'
import { groupDepartures, type DepartureGroup } from '../lib/departures'
import { distanceLabel, distanceM } from '../lib/geo'
import { hhmm } from '../lib/itinerary'
import type { Status } from '../lib/live'
import type { Station } from '../map/networkLayer'
import { hasProblem, stopDisruptions } from '../lib/status'
import { t } from '../i18n'
import './Lines.css' // the shared .segmented control
import './StationSheet.css'

const REFRESH_MS = 30_000

type Props = {
  station: Station
  status: Status | null
  /** The user's position as [lon, lat]: the card shows the distance to the stop. */
  position: [number, number] | null
  onDirections: () => void
  onGoFrom: () => void
  onClose: () => void
  onLine: (id: string) => void
}

/**
 * Station card (native StationSheet): the stop with its code and distance, the lines, "Buraya git" and
 * "Buradan git", then three tabs: departures (live board, then the timetable), lines, and disruptions.
 * A line with a reported problem shows the notice in place of its times.
 */
export function StationSheet({ station, status, position, onDirections, onGoFrom, onClose, onLine }: Props) {
  const [lines, setLines] = useState<Map<string, Line>>(new Map())
  const [tab, setTab] = useState(0)
  // The last good list is kept when a refresh fails (product rule 5); the error shows only with no list.
  const [groups, setGroups] = useState<{ id: string; list: DepartureGroup[] | null; error: boolean; at: number }>({
    id: '',
    list: null,
    error: false,
    at: 0,
  })

  useEffect(() => {
    loadLines().then((ls) => setLines(new Map(ls.map((l) => [l.id, l]))), () => {})
  }, [])

  // Bus stops have a live board (İETT, EGO, BURULAŞ); it comes first and the timetable follows. A stop kept
  // from before the data carried İETT's stop numbers (recent stops) gets its number from the stop list.
  const [lookedUp, setLookedUp] = useState<{ id: string; code?: string } | null>(null)
  const needsCode = CITY.live === 'iett' && station.mode === 'bus' && !station.code
  useEffect(() => {
    if (!needsCode) return
    let alive = true
    loadStops().then((all) => alive && setLookedUp({ id: station.id, code: all.find((x) => x.id === station.id)?.code }), () => {})
    return () => {
      alive = false
    }
  }, [needsCode, station.id])
  const stopRef = needsCode && lookedUp?.id === station.id ? { id: station.id, code: lookedUp.code } : station
  const boardStop = liveStop(stopRef)
  const timetable = CITY.routing

  useEffect(() => {
    if (!timetable) return
    let alive = true
    const load = () =>
      stopTimes(CITY.motisPrefix + station.id, new Date(), 40).then(
        (st) => alive && setGroups({ id: station.id, list: groupDepartures(st), error: false, at: Date.now() }),
        () => alive && setGroups((g) => ({ id: station.id, list: g.id === station.id ? g.list : null, error: true, at: Date.now() })),
      )
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [station.id, timetable])

  const current = groups.id === station.id ? groups : null
  const byName = (name: string) => [...lines.values()].find((l) => l.name === name)
  const disruptions = stopDisruptions(status, lines, station.lines)
  const dist = position ? distanceM(position[1], position[0], station.lat, station.lon) : null
  const subtitle = [station.transfer ? t('transferHub') : null, dist !== null ? distanceLabel(dist) : null].filter(Boolean).join(' · ')
  const tabs = CITY.live === 'iett' ? [t('tabDepartures'), t('tabLines'), t('tabDisruptions')] : [t('tabDepartures'), t('tabLines')]

  return (
    <div className="station">
      <PanelHeader title={station.name} subtitle={subtitle || undefined} trailing={<StopCode code={stopCode(stopRef)} />} onClose={onClose} />
      <div className="station-chips">
        {station.lines.map((id) => {
          const l = lines.get(id)
          return (
            <button key={id} className="chip-btn" onClick={() => onLine(id)} aria-label={`${l?.name ?? id} ${t('lines')}`}>
              <LineChip name={l?.name ?? id.toUpperCase()} line={l} />
            </button>
          )
        })}
      </div>
      {CITY.routing && (
        <div className="station-buttons">
          <Button label={t('goHere')} icon="route" primary onClick={onDirections} />
          <Button label={t('goFrom')} icon="route" onClick={onGoFrom} />
        </div>
      )}
      <div className="segmented station-tabs" role="tablist">
        {tabs.map((label, i) => (
          <button key={label} role="tab" aria-selected={i === tab} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && boardStop && <LiveArrivals stop={boardStop} stopId={station.id} lines={lines} onLine={onLine} />}
      {tab === 0 && !timetable && !boardStop && <p aria-live="polite" className="state-msg">{t('routingSoonAnkara')}</p>}
      {tab === 0 && timetable && (
        <div>
          {boardStop && <h3 className="section-label station-sub">{t('scheduledDepartures')}</h3>}
          {!current && <Skeleton rows={3} height={56} />}
          {current?.error && !current.list && <p aria-live="polite" className="state-msg">{t('routingUnavailable')}</p>}
          {current?.list?.length === 0 && <p aria-live="polite" className="state-msg">{t('noDepartures')}</p>}
          {current?.list?.map((g) =>
            hasProblem(status, g.line) ? (
              <div key={g.line + g.headsign} className="station-dep">
                <LineChip name={g.line} color={g.color} textColor={g.textColor} line={g.color ? undefined : byName(g.line)} />
                <span className="station-dep-problem">{t('lineProblem')}</span>
              </div>
            ) : (
              <DepartureRow key={g.line + g.headsign} g={g} at={current.at} lineOf={byName} onLine={onLine} />
            ),
          )}
        </div>
      )}

      {tab === 1 && (
        <ul className="station-lines">
          {station.lines.map((id) => {
            const l = lines.get(id)
            return (
              <li key={id}>
                <button className="station-line" onClick={() => onLine(id)} aria-label={l?.long_name ?? id}>
                  <LineChip name={l?.name ?? id.toUpperCase()} line={l} />
                  <span className="station-line-name">{l?.long_name ?? ''}</span>
                  <span className="station-line-chev" aria-hidden>
                    <Icon name="back" size={18} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {tab === 2 && (
        <div className="station-disruptions">
          {disruptions.length === 0 && <p aria-live="polite" className="state-msg">{t('noDisruption')}</p>}
          {disruptions.map((p) => (
            <div key={p.line} className="station-disruption">
              <div className="station-disruption-head">
                <span className="warn-dot" aria-hidden />
                <span className="station-disruption-line">{p.line}</span>
              </div>
              <p className="station-disruption-text">{p.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** One line and direction: the headsign, its live or scheduled state, and the times (native DepartureRow). */
function DepartureRow({
  g,
  at,
  lineOf,
  onLine,
}: {
  g: DepartureGroup
  at: number
  lineOf: (name: string) => Line | undefined
  onLine: (id: string) => void
}) {
  const live = !!g.times[0]?.live
  const mins = g.times.map((x) => Math.round((x.at.getTime() - at) / 60000))
  const first = mins[0]
  const rest = g.times.slice(1).map((x, i) => (mins[i + 1] <= 60 ? String(mins[i + 1]) : hhmm(x.at)))
  // A tap opens the line page, as a row of the live board does (LiveArrivals).
  const line = lineOf(g.line)
  return (
    <button className="station-dep station-dep-btn" onClick={() => line && onLine(line.id)} disabled={!line} aria-label={`${g.line} ${g.headsign}`}>
      <LineChip name={g.line} color={g.color} textColor={g.textColor} line={g.color ? undefined : lineOf(g.line)} />
      <span className="station-dep-text">
        <span className="station-dep-head">{g.headsign}</span>
        <span className={live ? 'station-dep-label live' : 'station-dep-label'}>
          {live && (
            <span className="live-icon" aria-hidden>
              <Icon name="signal" size={12} />
            </span>
          )}
          {live ? t('live') : t('scheduled')}
        </span>
      </span>
      <span className="station-dep-when">
        {first <= 0 ? (
          <span className={live ? 'station-dep-now live' : 'station-dep-now'}>{t('now')}</span>
        ) : first <= 60 ? (
          <span className={live ? 'station-dep-min live' : 'station-dep-min'}>
            {first}
            <small> {t('min')}</small>
          </span>
        ) : (
          <span className="station-dep-clock">{hhmm(g.times[0].at)}</span>
        )}
        {rest.length > 0 && <span className="station-dep-rest">{rest.join(' · ')}</span>}
      </span>
    </button>
  )
}
