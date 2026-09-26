import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { plan, type Itinerary } from '../lib/api'
import { hhmm, pickOptions, summarize } from '../lib/itinerary'
import type { Place } from '../lib/search'
import { t } from '../i18n'
import { WhenPicker } from '../components/WhenPicker'
import type { When } from '../lib/when'
import './Results.css'

type Props = {
  from: Place | null
  to: Place
  onEditFrom: () => void
  onEditTo: () => void
  onClose: () => void
  onOpen: (it: Itinerary) => void
}

type State = { key: string } & ({ status: 'loading' } | { status: 'error' } | { status: 'ok'; options: Itinerary[] })

export function Results({ from, to, onEditFrom, onEditTo, onClose, onOpen }: Props) {
  const [attempt, setAttempt] = useState(0)
  const [when, setWhen] = useState<When>({ kind: 'now' })
  const whenKey = when.kind === 'now' ? 'now' : `${when.kind}@${when.at.getTime()}`
  const key = from ? `${from.lat},${from.lon}>${to.lat},${to.lon}#${attempt}#${whenKey}` : ''
  const [raw, setState] = useState<State>({ key: '', status: 'loading' })
  // A new query shows "loading" once; the same query never flickers.
  const state: State = raw.key === key ? raw : { key, status: 'loading' }

  useEffect(() => {
    if (!from) return
    let alive = true
    const at = when.kind === 'now' ? new Date() : when.at
    plan(from, to, at, when.kind === 'arrive').then(
      (its) => alive && setState({ key, status: 'ok', options: pickOptions(its) }),
      () => alive && setState({ key, status: 'error' }),
    )
    return () => {
      alive = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="results-sheet">
      <div className="trip-ends">
        <div className="ends">
          <button className="end" onClick={onEditFrom}>
            <span className="end-dot from" aria-hidden />
            <span className={from ? '' : 'placeholder'}>{from ? from.name : t('from')}</span>
          </button>
          <button className="end" onClick={onEditTo}>
            <span className="end-dot to" aria-hidden />
            <span>{to.name}</span>
          </button>
        </div>
        <button className="close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>

      <div className="when-row">
        <WhenPicker value={when} onChange={setWhen} />
      </div>
      {!from && <p className="muted pad">{t('pickOrigin')}</p>}
      {from && state.status === 'loading' && <p className="muted pad">{t('searchingRoutes')}</p>}
      {from && state.status === 'error' && (
        <div className="pad">
          <p className="muted">{t('routingUnavailable')}</p>
          <button className="retry" onClick={() => setAttempt((a) => a + 1)}>
            {t('retry')}
          </button>
        </div>
      )}
      {from && state.status === 'ok' && state.options.length === 0 && <p className="muted pad">{t('noRoute')}</p>}
      {from && state.status === 'ok' && (
        <ul className="options">
          {state.options.map((it) => (
            <li key={it.startTime + it.endTime + it.legs.length}>
              <OptionCard it={it} onOpen={() => onOpen(it)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OptionCard({ it, onOpen }: { it: Itinerary; onOpen: () => void }) {
  const s = summarize(it)
  const live = it.legs.some((l) => l.realTime)
  return (
    <button className="option" onClick={onOpen}>
      <div className="option-top">
        <span className="option-min">
          {s.minutes} <small>{t('min')}</small>
        </span>
        <span className="option-time">
          {hhmm(s.start)} – {hhmm(s.end)}
        </span>
      </div>
      <div className="option-rides">
        {s.rides.map((r, i) => (
          <span key={i} className="ride">
            {i > 0 && <span className="ride-sep" aria-hidden>›</span>}
            <LineChip name={r.name} color={r.color} textColor={r.textColor} />
          </span>
        ))}
      </div>
      <div className="option-meta">
        <span>{s.transfers === 0 ? t('noTransfer') : `${s.transfers} ${t('transfers')}`}</span>
        <span>
          <Icon name="walk" size={14} /> {s.walkMinutes} {t('min')}
        </span>
        <span className={live ? 'tag live' : 'tag'}>{live ? t('live') : t('scheduled')}</span>
      </div>
      {s.firstDeparture && (
        <div className="option-next">
          {hhmm(s.firstDeparture.time)} · {s.firstDeparture.stop}
        </div>
      )}
    </button>
  )
}
