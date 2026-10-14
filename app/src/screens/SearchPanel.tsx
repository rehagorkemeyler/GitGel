import { StopCode } from '../components/StopCode'
import { CITY } from '../lib/city'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { categoryOf, formatDistance, freePlaces, googlePlace, googleSuggest, newSession, type Category, type Suggestion } from '../lib/places'
import { loadSearchIndex, lineColors, type Line } from '../lib/data'
import { clearRecent, frequentPlaces, recentPlaces, rememberPlace } from '../lib/recent'
import { fold, searchIndex, type IndexRow, type Place } from '../lib/search'
import { API_BASE, LIVE_BASE } from '../lib/config'
import { lang, t } from '../i18n'
import './SearchPanel.css'

// Round badge colour per Google place category (same colours as the native app).
const CATEGORY_TINT: Record<Category, string> = {
  food: '#ff453a',
  cafe: '#ff9f0a',
  park: '#30b556',
  shop: '#e0a800',
  school: '#5e5ce6',
  health: '#ff375f',
  culture: '#af52de',
  transit: '#2f7cf6',
  other: '#8e8e93',
}

type Props = {
  title: string
  onPick: (p: Place) => void
  onBack: () => void
  /** Offer "my location" as the first choice (used for the origin). */
  myLocation?: Place | null
  /** User position [lon, lat]: nearest results first, with distances. */
  near?: [number, number] | null
}

export function SearchPanel({ title, onPick, onBack, myLocation, near = null }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<IndexRow[] | null>(null)
  const [indexError, setIndexError] = useState(false)
  const [remote, setRemote] = useState<{ q: string; places: Place[] }>({ q: '', places: [] })
  const [google, setGoogle] = useState<{ q: string; list: Suggestion[] }>({ q: '', list: [] })
  const [colors, setColors] = useState<Map<string, Line>>(new Map())
  const [recent, setRecent] = useState<Place[]>(recentPlaces)
  // Places opened most often on this phone, above the recent ones while nothing is typed.
  const [frequent] = useState<Place[]>(() => frequentPlaces(3))
  // One token per search session: the suggest calls and the final details call bill as one.
  const session = useRef(newSession())
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    loadSearchIndex().then(setIndex, () => setIndexError(true))
    lineColors().then(setColors, () => {})
  }, [])

  const local = useMemo(() => (index ? searchIndex(index, query, 8, near) : []), [index, query, near])
  // A typed name that is exactly a local stop or line needs no Google call (cheaper and faster).
  const exactLocal = local.some((r) => fold(r.name) === fold(query.trim()))
  // Native places.loading, derived as native does: a place search is due for this text and no
  // result for this query has arrived yet. On from the first keystroke, not when the debounce fires.
  const placeSearchDue = query.trim().length >= 2 && !!(LIVE_BASE || (API_BASE && CITY.routing))
  const searching = placeSearchDue && remote.q !== query && google.q !== query

  useEffect(() => {
    const text = query.trim()
    // Place search: Google through our capped server proxy; the free search (Photon, else MOTIS) when that is capped or down.
    if (!placeSearchDue) return
    let alive = true
    const timer = setTimeout(async () => {
      if (LIVE_BASE && text.length >= 3 && !exactLocal) {
        try {
          const list = await googleSuggest(query, session.current, near)
          if (alive) setGoogle({ q: query, list })
          return
        } catch {
          // Capped or down: the free search below.
        }
      }
      freePlaces(query, lang, near).then(
        (r) => {
          if (alive) setRemote({ q: query, places: r })
        },
        () => {
          // A failed search still ends the loading state: it answers with no places for this query.
          if (alive) setRemote({ q: query, places: [] })
        },
      )
    }, 300)
    return () => {
      // The request for the previous query is ignored from now on.
      alive = false
      clearTimeout(timer)
    }
  }, [query, near, exactLocal, placeSearchDue])

  const pick = (p: Place) => {
    rememberPlace(p)
    onPick(p)
  }

  // Google details end the session: the next search starts a new token.
  const pickGoogle = (s: Suggestion) => {
    googlePlace(s.id, session.current).then(
      (p) => {
        session.current = newSession()
        pick(p)
      },
      () => {},
    )
  }

  const showRecent = !query.trim()
  const results = showRecent ? recent : [...local, ...(remote.q === query ? remote.places : [])]
  const placesFound = (remote.q === query && remote.places.length > 0) || (google.q === query && google.list.length > 0)

  return (
    <>
      <div className="search-head">
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
        {/* Native search: "Vazgeç" (cancel) closes the search, the field stays a field. */}
        <button className="search-cancel" onClick={onBack}>
          {t('cancel')}
        </button>
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

      {showRecent && frequent.length > 0 && (
        <>
          <div className="result-head section-label">
            <span>{t('frequent')}</span>
          </div>
          <PlaceList places={frequent} colors={colors} onPick={pick} />
        </>
      )}

      {showRecent && recent.length > 0 && (
        <div className="result-head section-label">
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

      <PlaceList places={results} colors={colors} onPick={pick} />

      {/* Native places.loading: shown until a Google or free place result for this query arrives. */}
      {searching && !showRecent && !placesFound && (
        <p aria-live="polite" className="state-msg">{t('searching')}</p>
      )}

      {google.q === query && google.list.length > 0 && (
        <>
          <ul className="results" aria-live="polite">
            {google.list.map((s) => (
              <li key={s.id}>
                <button className="result" onClick={() => pickGoogle(s)}>
                  <span className="result-icon" style={{ background: CATEGORY_TINT[categoryOf(s.types)], color: '#ffffff' }}>
                    <Icon name="pin" />
                  </span>
                  <span className="result-text">
                    <span className="result-name">{s.name}</span>
                    {s.sub && <span className="result-sub">{s.sub}</span>}
                  </span>
                  {s.distance !== undefined && <span className="result-distance">{formatDistance(s.distance)}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p aria-live="polite" className="state-msg">{t('byGoogle')}</p>
        </>
      )}

      {/* Native "nothing": only once no place search is pending and no place result came back for this query. */}
      {!showRecent && results.length === 0 && !placesFound && !searching && index && <p aria-live="polite" className="state-msg">{t('noResults')}</p>}
      {indexError && <p aria-live="polite" className="state-msg">{t('dataUnavailable')}</p>}
    </>
  )
}

function PlaceList({ places, colors, onPick }: { places: Place[]; colors: Map<string, Line>; onPick: (p: Place) => void }) {
  return (
    <ul className="results">
      {places.map((p, i) => (
        <li key={`${p.name}-${p.lat}-${i}`}>
          <button className="result" onClick={() => onPick(p)}>
            <span className="result-icon">
              <Icon name={p.kind === 'stop' ? 'route' : 'pin'} />
            </span>
            <span className="result-text">
              <span className="result-name">
                {p.name}
                <StopCode code={p.code} />
              </span>
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
            {p.distance !== undefined && <span className="result-distance">{formatDistance(p.distance)}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
