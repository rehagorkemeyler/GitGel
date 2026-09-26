import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel } from '../components/Panel'
import { Icon } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { geocode } from '../lib/api'
import { loadSearchIndex, lineColors, type Line } from '../lib/data'
import { recentPlaces, rememberPlace, clearRecent } from '../lib/recent'
import { searchIndex, type IndexRow, type Place } from '../lib/search'
import { API_BASE } from '../lib/config'
import { lang, t } from '../i18n'
import './SearchPanel.css'

type Props = {
  title: string
  onPick: (p: Place) => void
  onBack: () => void
  /** Offer "my location" as the first choice (used for the origin). */
  myLocation?: Place | null
}

export function SearchPanel({ title, onPick, onBack, myLocation }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<IndexRow[] | null>(null)
  const [indexError, setIndexError] = useState(false)
  const [remote, setRemote] = useState<{ q: string; places: Place[] }>({ q: '', places: [] })
  const [colors, setColors] = useState<Map<string, Line>>(new Map())
  const [recent, setRecent] = useState<Place[]>(recentPlaces)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    loadSearchIndex().then(setIndex, () => setIndexError(true))
    lineColors().then(setColors, () => {})
  }, [])

  const local = useMemo(() => (index ? searchIndex(index, query) : []), [index, query])

  useEffect(() => {
    if (!API_BASE || query.trim().length < 3) return
    let alive = true
    const timer = setTimeout(() => {
      geocode(query, lang).then(
        (r) => alive && setRemote({ q: query, places: r }),
        () => {},
      )
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query])

  const pick = (p: Place) => {
    rememberPlace(p)
    onPick(p)
  }

  const showRecent = !query.trim()
  const results = showRecent ? recent : [...local, ...(remote.q === query ? remote.places : [])]

  return (
    <Panel title={title} onBack={onBack}>
      <div className="search-box">
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t('searchPlaceholder')}
          aria-label={title}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && results[0] && pick(results[0])}
        />
      </div>

      {myLocation && showRecent && (
        <button className="result" onClick={() => onPick(myLocation)}>
          <span className="result-icon accent">
            <Icon name="locate" />
          </span>
          <span className="result-text">
            <span className="result-name">{t('myLocation')}</span>
          </span>
        </button>
      )}

      {showRecent && recent.length > 0 && (
        <div className="result-head">
          <span>{t('recent')}</span>
          <button
            className="link"
            onClick={() => {
              clearRecent()
              setRecent([])
            }}
          >
            {t('clear')}
          </button>
        </div>
      )}

      <ul className="results" aria-live="polite">
        {results.map((p, i) => (
          <li key={`${p.name}-${p.lat}-${i}`}>
            <button className="result" onClick={() => pick(p)}>
              <span className="result-icon">
                <Icon name={p.kind === 'stop' ? 'route' : 'pin'} />
              </span>
              <span className="result-text">
                <span className="result-name">{p.name}</span>
                {p.lines && p.lines.length > 0 ? (
                  <span className="chips">
                    {p.lines.slice(0, 5).map((l) => (
                      <LineChip key={l} name={l} line={colors.get(l)} />
                    ))}
                  </span>
                ) : (
                  p.sub && <span className="result-sub">{p.sub}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!showRecent && results.length === 0 && index && <p className="muted">{t('noResults')}</p>}
      {indexError && <p className="muted">{t('dataUnavailable')}</p>}
    </Panel>
  )
}
