import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { LineChip } from './LineChip'
import { loadJson, type Line } from '../lib/data'
import { directionsAt } from '../lib/direction'
import { eta, inTime } from '../lib/eta'
import { nextFirstArrival } from '../lib/firstTrip'
import { hhmm } from '../lib/itinerary'
import type { LineDetail } from '../lib/lineDetail'
import { useLiveArrivals, type LiveLineStatus } from '../lib/live'
import { useNow } from '../lib/useNow'
import { t } from '../i18n'
import { Skeleton } from './Skeleton'
import './LiveArrivals.css'

/**
 * Stop card: live buses heading to this stop, soonest first (İETT, EGO or BURULAŞ board), then the other lines.
 * `stop` is the live board's stop number, `stopId` the stop's id in the data ("eg_11654", "br_564", "355").
 */
export function LiveArrivals({ stop, stopId, lines, onLine }: { stop: string; stopId: string; lines: Map<string, Line>; onLine?: (id: string) => void }) {
  const state = useLiveArrivals(stop)
  const now = useNow(1000)
  const byName = new Map([...lines.values()].map((l) => [l.name, l]))
  const dirs = useDirections(stopId, lines, [...(state?.arrivals ?? []).map((a) => a.line), ...(state?.lines ?? []).map((l) => l.line)])

  return (
    <section aria-live="polite">
      <h3 className="section-label station-sub">
        {t('liveArrivals')} <span className="live-icon" aria-hidden><Icon name="signal" size={12} /></span> <span className="live-tag">{t('live')}</span>
      </h3>
      {!state && <Skeleton rows={3} height={56} />}
      {state?.error && !state.arrivals && <p aria-live="polite" className="state-msg">{t('liveUnavailable')}</p>}
      {state?.arrivals?.length === 0 && <p aria-live="polite" className="state-msg">{t('noLiveBuses')}</p>}
      <ul className="live-arrivals">
        {state?.arrivals?.map((a, i) => {
          const l = byName.get(a.line)
          const dir = dirs.get(a.line)
          return (
            <li key={`${a.line}-${a.plate ?? i}`}>
              <button className="arrival" onClick={() => l && onLine?.(l.id)} disabled={!onLine || !l}>
                <LineChip name={a.line} line={l} />
                <span className="arrival-main">
                  <span className="arrival-name">{dir ? `${dir} ${t('direction')}` : l?.long_name || a.lineName}</span>
                  <span className="arrival-meta">
                    {[
                      a.plate,
                      a.stopsAway !== null && a.stopsAway > 0 ? `${a.stopsAway} ${t('stopsAway')}` : null,
                      a.features.includes('Engelli') ? '♿' : null,
                      a.features.includes('Körüklü') ? t('articulated') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className={i === 0 ? 'arrival-eta first' : 'arrival-eta'}>{eta(a.etaSeconds - (now - state.at) / 1000)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {state && state.lines.length > 0 && (
        <>
          <h3 className="section-label station-sub">{t('otherLines')}</h3>
          <ul className="live-arrivals">
            {state.lines.map((ls) => (
              <LineStatusRow
                key={ls.line}
                status={ls}
                dir={dirs.get(ls.line)}
                line={byName.get(ls.line)}
                stopId={stopId}
                sinceMs={now - state.at}
                now={now}
                onLine={onLine}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Where each line goes from this stop ("Oran yönü"), by line name; filled in as line files load. */
function useDirections(stop: string, lines: Map<string, Line>, names: string[]): Map<string, string> {
  const [dirs, setDirs] = useState<{ stop: string; map: Map<string, string> }>({ stop: '', map: new Map() })
  const key = [...new Set(names)].sort().join(',')
  useEffect(() => {
    if (!key || !lines.size) return
    let alive = true
    const byName = new Map([...lines.values()].map((l) => [l.name, l]))
    const want = key.split(',').map((n) => byName.get(n)).filter((l): l is Line => !!l)
    directionsAt(want, stop).then(
      (map) => {
        if (alive) setDirs((d) => ({ stop, map: new Map([...(d.stop === stop ? d.map : []), ...map]) }))
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [stop, lines, key])
  return dirs.stop === stop ? dirs.map : NO_DIRS
}
const NO_DIRS = new Map<string, string>()

/** "24:30" (EGO, after midnight) -> "00:30". */
function clock(s: string): string {
  const [h, m] = s.split(':').map(Number)
  return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A line with no live bus coming: next departure from its first stop, or tomorrow's first trip here. */
function LineStatusRow({
  status,
  dir,
  line,
  stopId,
  sinceMs,
  now,
  onLine,
}: {
  status: LiveLineStatus
  dir: string | undefined
  line: Line | undefined
  stopId: string
  sinceMs: number
  now: number
  onLine?: (id: string) => void
}) {
  const [detail, setDetail] = useState<LineDetail | null>(null)
  useEffect(() => {
    if (!status.noMoreToday || !line) return
    loadJson<LineDetail>(`lines/${line.id}.json`).then(setDetail, () => {})
  }, [status.noMoreToday, line])
  const first = detail ? nextFirstArrival(detail, stopId, now) : null

  let text: string
  if (!status.noMoreToday && status.nextStart !== null && status.nextStartInMin !== null) {
    text = `${t('nextFromStart')} ${clock(status.nextStart)} · ${inTime(status.nextStartInMin * 60_000 - sinceMs)} ${t('later')}`
  } else if (status.noMoreToday) {
    text = t('noMoreToday') + (first ? ` · ${t('firstTrip')} ${hhmm(new Date(first))} · ${inTime(first - now)} ${t('later')} (${t('scheduled')})` : '')
  } else {
    text = t('noLiveBusSeeTimetable')
  }
  return (
    <li>
      <button className="arrival" onClick={() => line && onLine?.(line.id)} disabled={!onLine || !line}>
        <LineChip name={status.line} line={line} />
        <span className="arrival-main">
          <span className="arrival-name">{dir ? `${dir} ${t('direction')}` : line?.long_name || status.lineName}</span>
          <span className="arrival-meta">{text}</span>
        </span>
        <span />
      </button>
    </li>
  )
}
