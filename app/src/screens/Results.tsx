import { CITY } from '../lib/city'
import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { DepartureLine, ProblemLine } from '../components/DepartureLine'
import { Icon } from '../components/Icon'
import { RouteChain } from '../components/RouteChain'
import { Skeleton } from '../components/Skeleton'
import { WhenPicker } from '../components/WhenPicker'
import { plan, type Itinerary } from '../lib/api'
import { hhmm, pickOptions, summarize } from '../lib/itinerary'
import { chain } from '../lib/route'
import type { Place } from '../lib/search'
import { problemsOf } from '../lib/status'
import type { When } from '../lib/when'
import { t } from '../i18n'
import './Results.css'

type Props = {
  from: Place | null
  to: Place
  onEditFrom: () => void
  onEditTo: () => void
  /** Swaps origin and destination (native onSwap). */
  onSwap: () => void
  onClose: () => void
  onOpen: (it: Itinerary) => void
  /** The options on screen, fastest first (drawn on the map). */
  onOptions?: (its: Itinerary[] | null) => void
  /** Short names of lines with a reported service problem. */
  problemLines: string[]
}

type State = { key: string } & ({ status: 'loading' } | { status: 'error' } | { status: 'ok'; options: Itinerary[] })

export function Results({ from, to, onEditFrom, onEditTo, onSwap, onClose, onOpen, onOptions, problemLines }: Props) {
  const [attempt, setAttempt] = useState(0)
  const [when, setWhen] = useState<When>({ kind: 'now' })
  const whenKey = when.kind === 'now' ? 'now' : `${when.kind}@${when.at.getTime()}`
  const key = from ? `${from.lat},${from.lon}>${to.lat},${to.lon}#${attempt}#${whenKey}` : ''
  const [raw, setState] = useState<State>({ key: '', status: 'loading' })
  // A new query shows "loading" once; the same query never flickers.
  const state: State = raw.key === key ? raw : { key, status: 'loading' }
  const shown = state.status === 'ok' ? state.options : null
  useEffect(() => {
    onOptions?.(shown)
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onOptions?.(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!from || !CITY.routing) return
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
            <span className={from ? 'end-name' : 'end-name placeholder'}>{from ? from.name : t('from')}</span>
          </button>
          <button className="end" onClick={onEditTo}>
            <span className="end-dot to" aria-hidden />
            <span className="end-name">{to.name}</span>
          </button>
        </div>
        <div className="trip-side">
          <button className="round-btn" onClick={onClose} aria-label={t('close')}>
            <Icon name="close" size={18} />
          </button>
          <button className="round-btn" onClick={onSwap} aria-label={t('swap')}>
            <span className="swap-icon">
              <Icon name="route" size={18} />
            </span>
          </button>
        </div>
      </div>

      <div className="when-row">
        <WhenPicker value={when} onChange={setWhen} />
      </div>
      {!CITY.routing && <p aria-live="polite" className="state-msg">{t('routingSoonAnkara')}</p>}
      {CITY.routing && !from && <p aria-live="polite" className="state-msg">{t('pickOrigin')}</p>}
      {CITY.routing && from && state.status === 'loading' && (
        <div className="pad">
          <Skeleton rows={3} height={96} label={t('searchingRoutes')} />
        </div>
      )}
      {from && state.status === 'error' && (
        <div className="pad">
          <p aria-live="polite" className="state-msg">{t('routingUnavailable')}</p>
          <Button label={t('retry')} onClick={() => setAttempt((a) => a + 1)} />
        </div>
      )}
      {from && state.status === 'ok' && state.options.length === 0 && <p aria-live="polite" className="state-msg">{t('noRoute')}</p>}
      {from && state.status === 'ok' && (
        <ul className="options">
          {state.options.map((it, i) => (
            <li key={it.startTime + it.endTime + it.legs.length}>
              <OptionCard
                it={it}
                slower={i > 0 ? Math.round((it.duration - state.options[0].duration) / 60) : 0}
                problems={problemsOf(it, problemLines)}
                onOpen={() => onOpen(it)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One option (native Results OptionCard): minutes and arrival, the chain, transfers, then the next ride or the notice. */
function OptionCard({ it, slower, problems, onOpen }: { it: Itinerary; slower: number; problems: string[]; onOpen: () => void }) {
  const s = summarize(it)
  return (
    <button className="option" onClick={onOpen}>
      <div className="option-top">
        <span className="option-min">
          {s.minutes} <small>{t('min')}</small>
        </span>
        <span className="option-time">
          {t('arrival')} {hhmm(s.end)}
        </span>
      </div>
      <RouteChain items={chain(it)} />
      <div className="option-meta">
        {s.transfers === 0 ? t('noTransfer') : `${s.transfers} ${t(s.transfers === 1 ? 'transfer' : 'transfers')}`}
        {slower > 0 && ` · ${slower} ${t('min')} ${t('slower')}`}
      </div>
      {problems.length ? <ProblemLine lines={problems} /> : <DepartureLine it={it} />}
    </button>
  )
}
