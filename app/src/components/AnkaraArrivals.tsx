import { LineChip } from './LineChip'
import type { Line } from '../lib/data'
import { useAnkaraArrivals } from '../lib/live'
import { useNow } from '../lib/useNow'
import { eta } from '../lib/eta'
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
      <ul className="arrivals">
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
    </section>
  )
}
