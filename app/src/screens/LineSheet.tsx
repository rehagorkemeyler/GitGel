import { useEffect, useState } from 'react'
import { LineChip } from '../components/LineChip'
import { stopTimes } from '../lib/api'
import { hhmm } from '../lib/itinerary'
import { MOTIS_STOP_PREFIX } from '../lib/config'
import { currentDayType, type LineDetail } from '../lib/lineDetail'
import type { StopRow } from '../lib/data'
import { t } from '../i18n'
import './Lines.css'

type Props = {
  line: LineDetail | null
  stops: Map<string, StopRow>
  error: boolean
  dir: number
  onDir: (d: number) => void
  onClose: () => void
}

/** Always-visible part of the line page (the map above shows the line). */
export function LineHeader({ line, error, dir, onDir, onClose }: Props) {
  if (error) return <p className="muted">{t('dataUnavailable')}</p>
  if (!line) return <p className="muted">…</p>
  const d = line.directions[dir]
  const today = currentDayType()
  return (
    <div className="line-sheet">
      <div className="line-head">
        <LineChip name={line.name} line={line} />
        <span className="line-long">{line.long_name}</span>
        <button className="close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      {line.directions.length > 1 && (
        <div className="segmented" role="tablist">
          {line.directions.map((x, i) => (
            <button key={i} role="tab" aria-selected={i === dir} className={i === dir ? 'on' : ''} onClick={() => onDir(i)}>
              {x.headsign ? `${x.headsign} ${t('direction')}` : `${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {d && (
        <table className="first-last">
          <thead>
            <tr>
              <th />
              <th>{t('firstTrip')}</th>
              <th>{t('lastTrip')}</th>
            </tr>
          </thead>
          <tbody>
            {(['weekday', 'saturday', 'sunday'] as const).map(
              (k) =>
                d.first_last[k] && (
                  <tr key={k} className={k === today ? 'today' : ''}>
                    <th>{t(k)}</th>
                    <td>{d.first_last[k]![0]}</td>
                    <td>{d.first_last[k]![1] === 'night' ? t('allNight') : d.first_last[k]![1]}</td>
                  </tr>
                ),
            )}
          </tbody>
        </table>
      )}
      <p className="muted pull-hint">{t('pullForStops')}</p>
    </div>
  )
}

/** Stops of the chosen direction; tap one to see the next arrivals of this line there. */
export function LineStops({ line, stops, dir }: Props) {
  const [open, setOpen] = useState<number | null>(null)
  const d = line?.directions[dir]
  if (!line || !d) return null
  return (
    <>
      <p className="muted">{t('scheduleNote')}</p>
      <ol className="line-stops" style={{ borderColor: line.color ? `#${line.color}` : 'var(--border)' }}>
        {d.stops.map((s, i) => (
          <li key={`${s}-${i}`}>
            <button className="stop-row" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span>{stops.get(s)?.name ?? '…'}</span>
              {d.offsets?.[i] != null && i > 0 && <span className="muted">+{d.offsets[i]} {t('min')}</span>}
            </button>
            {open === i && <StopArrivals stopId={s} line={line.name} headsign={d.headsign} />}
          </li>
        ))}
      </ol>
    </>
  )
}

function StopArrivals({ stopId, line, headsign }: { stopId: string; line: string; headsign: string }) {
  const [times, setTimes] = useState<Date[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    stopTimes(MOTIS_STOP_PREFIX + stopId, new Date(), 200).then(
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
  if (error) return <p className="muted arrivals">{t('routingUnavailable')}</p>
  if (!times) return <p className="muted arrivals">…</p>
  if (!times.length) return <p className="muted arrivals">{t('noDepartures')}</p>
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
