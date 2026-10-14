import { useEffect, useState, type CSSProperties } from 'react'
import { LineChip } from '../components/LineChip'
import { PanelHeader } from '../components/PanelHeader'
import { Skeleton } from '../components/Skeleton'
import { StopCode } from '../components/StopCode'
import { stopTimes } from '../lib/api'
import { CITY, stopCode } from '../lib/city'
import type { StopRow } from '../lib/data'
import { hhmm } from '../lib/itinerary'
import { currentDayType, type LineDetail } from '../lib/lineDetail'
import type { Status } from '../lib/live'
import { hasProblem, lineMessage } from '../lib/status'
import { t } from '../i18n'
import './Lines.css'

type Props = {
  line: LineDetail | null
  stops: Map<string, StopRow>
  error: boolean
  dir: number
  onDir: (d: number) => void
  status: Status | null
  onClose: () => void
}

/**
 * Line page header (native LineSheet): the line chip and long name, the notice while the line has a problem,
 * the direction switch, first and last trips and the schedule note. A problem hides the schedule.
 */
export function LineHeader({ line, error, dir, onDir, status, onClose }: Props) {
  if (error)
    return (
      <div className="line-sheet">
        <PanelHeader title="" small onClose={onClose} />
        <p aria-live="polite" className="state-msg">
          {t('dataUnavailable')}
        </p>
      </div>
    )
  if (!line)
    return (
      <div className="line-sheet">
        <PanelHeader title="…" small onClose={onClose} />
        <Skeleton rows={5} height={40} />
      </div>
    )
  const d = line.directions[dir]
  const today = currentDayType()
  const problem = hasProblem(status, line.name)
  return (
    <div className="line-sheet">
      <PanelHeader title={line.long_name} small leading={<LineChip name={line.name} line={line} big />} onClose={onClose} />
      {problem && <div className="line-notice">{lineMessage(status, line.name) ?? t('lineProblem')}</div>}
      {line.directions.length > 1 && (
        <div className="segmented" role="tablist">
          {line.directions.map((x, i) => (
            <button key={i} role="tab" aria-selected={i === dir} className={i === dir ? 'on' : ''} onClick={() => onDir(i)}>
              {x.headsign ? `${x.headsign} ${t('direction')}` : `${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {d && !problem && (
        <div className="first-last-card">
          <table className="first-last">
            <thead>
              <tr>
                <th />
                <th scope="col">{t('firstTrip')}</th>
                <th scope="col">{t('lastTrip')}</th>
              </tr>
            </thead>
            <tbody>
              {(['weekday', 'saturday', 'sunday'] as const).map(
                (k) =>
                  d.first_last[k] && (
                    <tr key={k} className={k === today ? 'today' : ''}>
                      <th scope="row">{t(k)}</th>
                      <td>{d.first_last[k]![0]}</td>
                      <td>{d.first_last[k]![1] === 'night' ? t('allNight') : d.first_last[k]![1]}</td>
                    </tr>
                  ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {d && !problem && <p className="schedule-note">{t('scheduleNote')}</p>}
      <p className="pull-hint">{t('pullForStops')}</p>
    </div>
  )
}

/** Stops of the chosen direction, on a rail; tap one to see the next arrivals of this line there (native). */
export function LineStops({ line, stops, dir, status }: Props) {
  // The open stop lives in this component: the caller keys it by line and direction, so a new one folds it (native).
  const [open, setOpen] = useState<number | null>(null)
  const d = line?.directions[dir]
  if (!line || !d) return null
  const problem = hasProblem(status, line.name)
  const color = line.color ? `#${line.color}` : 'var(--accent)'
  return (
    <ol className="line-stops" style={{ '--line': color } as CSSProperties}>
      {d.stops.map((s, i) => {
        const first = i === 0
        const last = i === d.stops.length - 1
        return (
          <li key={`${s}-${i}`}>
            <button className="stop-row" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span className="stop-rail" aria-hidden>
                <span className={`stop-bar${first ? ' first' : ''}${last ? ' last' : ''}`} />
                <span className="stop-node" />
              </span>
              <span className={first || last ? 'stop-name end' : 'stop-name'}>{stops.get(s)?.name ?? '…'}</span>
              <StopCode code={stopCode(s)} />
              {!problem && d.offsets?.[i] != null && i > 0 && (
                <span className="stop-offset">
                  +{d.offsets[i]} {t('min')}
                </span>
              )}
            </button>
            {open === i && !problem && <StopArrivals stopId={s} line={line.name} headsign={d.headsign} />}
          </li>
        )
      })}
    </ol>
  )
}

function StopArrivals({ stopId, line, headsign }: { stopId: string; line: string; headsign: string }) {
  const [times, setTimes] = useState<Date[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    stopTimes(CITY.motisPrefix + stopId, new Date(), 200).then(
      (st) => {
        if (!alive) return
        const mine = st.filter((x) => x.routeShortName === line)
        const sameDir = mine.filter((x) => !headsign || (x.headsign ?? '').toLocaleLowerCase('tr').includes(headsign.toLocaleLowerCase('tr').slice(0, 5)))
        setTimes((sameDir.length ? sameDir : mine).slice(0, 24).map((x) => new Date(x.place.departure ?? x.place.arrival ?? '')))
      },
      () => alive && setError(true),
    )
    return () => {
      alive = false
    }
  }, [stopId, line, headsign])
  if (error) return <p aria-live="polite" className="state-msg arrivals">{t('routingUnavailable')}</p>
  if (!times) return <Skeleton rows={3} height={56} />
  if (!times.length) return <p aria-live="polite" className="state-msg arrivals">{t('noDepartures')}</p>
  return (
    <div className="arrivals">
      {times.map((x, i) => (
        <span key={i} className="arrival-time">
          {hhmm(x)}
        </span>
      ))}
    </div>
  )
}
