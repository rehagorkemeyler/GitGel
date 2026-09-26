import { useEffect, useState } from 'react'
import { LineChip } from './LineChip'
import { loadJson, type Line } from '../lib/data'
import { useAnkaraArrivals, type AnkaraLineStatus } from '../lib/live'
import { useNow } from '../lib/useNow'
import { eta, inTime } from '../lib/eta'
import { nextFirstArrival } from '../lib/firstTrip'
import type { LineDetail } from '../lib/lineDetail'
import { hhmm } from '../lib/itinerary'
import { t } from '../i18n'
import './AnkaraArrivals.css'

/** Ankara stop card: live EGO buses heading to this stop, soonest first. */
export function AnkaraArrivals({ stop, lines, onLine }: { stop: string; lines: Map<string, Line>; onLine?: (id: string) => void }) {
  const state = useAnkaraArrivals(stop)
  const now = useNow(1000)
  const byName = new Map([...lines.values()].map((l) => [l.name, l]))

  return (
    <section aria-live="polite">
      <h3 className="station-sub">
        {t('liveArrivals')} <i className="dot live" aria-hidden /> <span className="live-tag">{t('live')}</span>
      </h3>
      {!state && <p className="muted">…</p>}
      {state?.error && !state.arrivals && <p className="muted">{t('liveUnavailable')}</p>}
      {state?.arrivals?.length === 0 && <p className="muted">{t('noLiveBuses')}</p>}
      <ul className="ego-arrivals">
        {state?.arrivals?.map((a, i) => (
          <li key={`${a.line}-${a.plate ?? i}`}>
            <button
              className="arrival"
              onClick={() => {
                const l = byName.get(a.line)
                if (l) onLine?.(l.id)
              }}
              disabled={!onLine || !byName.get(a.line)}
            >
            <LineChip name={a.line} line={byName.get(a.line)} />
            <span className="arrival-main">
              <span className="arrival-name">{byName.get(a.line)?.long_name || a.lineName}</span>
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
        ))}
      </ul>
      {state && state.lines.length > 0 && (
        <>
          <h3 className="station-sub">{t('otherLines')}</h3>
          <ul className="ego-arrivals">
            {state.lines.map((l) => (
              <LineStatusRow
                key={l.line}
                status={l}
                line={byName.get(l.line)}
                stopId={`eg_${stop}`}
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

/** "24:30" (EGO, after midnight) -> "00:30". */
function clock(s: string): string {
  const [h, m] = s.split(':').map(Number)
  return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A line with no live bus coming: next departure from its first stop, or tomorrow's first trip here. */
function LineStatusRow({
  status,
  line,
  stopId,
  sinceMs,
  now,
  onLine,
}: {
  status: AnkaraLineStatus
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
  } else {
    text = t('noMoreToday') + (first ? ` · ${t('firstTrip')} ${hhmm(new Date(first))} · ${inTime(first - now)} ${t('later')} (${t('scheduled')})` : '')
  }
  return (
    <li>
      <button className="arrival" onClick={() => line && onLine?.(line.id)} disabled={!onLine || !line}>
        <LineChip name={status.line} line={line} />
        <span className="arrival-main">
          <span className="arrival-name">{line?.long_name || status.lineName}</span>
          <span className="arrival-meta">{text}</span>
        </span>
        <span />
      </button>
    </li>
  )
}
