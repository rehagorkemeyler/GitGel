import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { PlaceBadge } from '../components/PlaceBadge'
import { loadLines, loadSearchIndex, type Line } from '../lib/data'
import { distanceM } from '../lib/geo'
import { lineHits, searchesPlaces, stationIcon, stopSubline } from '../lib/placeRules'
import { categoryOf, Fallback, formatDistance, freePlaces, googlePlace, googleSuggest, newSession, type Category, type Suggestion } from '../lib/places'
import { clearRecent, frequentPlaces, recentPlaces, rememberPlace, samePlace, type RecentPlace } from '../lib/recent'
import { fold, searchIndex, type IndexRow, type Mode, type Place } from '../lib/search'
import { lang, t } from '../i18n'
import './SearchPanel.css'

// Round badge per Google place category (native CATEGORY_BADGE): tint and glyph.
const CATEGORY_BADGE: Record<Category, { icon: IconName; tint: string }> = {
  food: { icon: 'food', tint: '#ff453a' },
  cafe: { icon: 'cafe', tint: '#ff9f0a' },
  park: { icon: 'tree', tint: '#30b556' },
  shop: { icon: 'bag', tint: '#e0a800' },
  school: { icon: 'school', tint: '#5e5ce6' },
  health: { icon: 'medical', tint: '#ff375f' },
  culture: { icon: 'star', tint: '#af52de' },
  transit: { icon: 'bus', tint: '#2f7cf6' },
  other: { icon: 'pin', tint: '#8e8e93' },
}

// Round badge per stop mode (native MODE_BADGE).
const MODE_BADGE: Record<Mode, { icon: IconName; tint: string }> = {
  metro: { icon: 'train', tint: '#2f7cf6' },
  rail: { icon: 'train', tint: '#2f7cf6' },
  funicular: { icon: 'train', tint: '#2f7cf6' },
  cablecar: { icon: 'train', tint: '#2f7cf6' },
  tram: { icon: 'train', tint: '#1f9d8f' },
  metrobus: { icon: 'bus', tint: '#ff8a00' },
  bus: { icon: 'bus', tint: '#ff8a00' },
  ferry: { icon: 'ship', tint: '#0a9bd6' },
}

type Props = {
  title: string
  onPick: (p: Place) => void
  /** A stop with a code, or a station recent in destination search: its card opens (native onStop). */
  onStop: (p: Place) => void
  /** A line row: its line page opens (native onLine). */
  onLine: (id: string) => void
  onBack: () => void
  /** Offer "my location" as the first choice (used for the origin). */
  myLocation?: Place | null
  /** User position [lon, lat]: nearest results first, with distances. */
  near?: [number, number] | null
  /** "Haritada seç": closes the search, and a long press on the map picks the destination. */
  onPickOnMap?: () => void
}

type Remote = { q: string; google: Suggestion[]; free: Place[] }

/**
 * "Nereye?" (native SearchPanel): our own stops and lines as you type, then (after a short pause)
 * Google places through our capped server proxy, or free search when Google is capped or unreachable.
 */
export function SearchPanel({ title, onPick, onStop, onLine, onBack, myLocation, near = null, onPickOnMap }: Props) {
  const me = myLocation ?? null
  const origin = me !== null
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<IndexRow[] | null>(null)
  const [indexError, setIndexError] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [remote, setRemote] = useState<Remote>({ q: '', google: [], free: [] })
  // Places opened most often on this phone, above the recent ones while nothing is typed.
  const [frequent] = useState<RecentPlace[]>(() => frequentPlaces(3))
  // Frequent ones are already on top: do not list them twice.
  const [recent, setRecent] = useState<RecentPlace[]>(() => recentPlaces().filter((p) => !frequent.some((x) => samePlace(x, p))))
  // One token per search session: the suggest calls and the final details call bill as one.
  const session = useRef(newSession())
  // Once Google says "capped" (or is unreachable), this search session stays on the free path.
  const googleOff = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    loadSearchIndex().then(setIndex, () => setIndexError(true))
    loadLines().then(setLines, () => {})
  }, [])

  const f = fold(query)
  // Nothing typed: the frequent and recent places show instead of results.
  const idle = !f
  const local = useMemo(() => (index && f ? searchIndex(index, query, 6, near) : []), [index, query, near, f])
  const lineMatches = useMemo(() => lineHits(lines, query), [lines, query])
  // A full-name match of our own data answers the question: no need to ask Google.
  const strongLocal = local.some((s) => fold(s.name) === f) || lineMatches.some((l) => fold(l.name) === f)
  // Place search is due from three letters, and not when our own data has the exact name.
  const wantsPlaces = searchesPlaces(query) && !strongLocal

  useEffect(() => {
    // Short text, or our own exact name: no place search. Results are only shown while wantsPlaces holds.
    if (!wantsPlaces) return
    let alive = true
    const timer = setTimeout(async () => {
      if (!googleOff.current) {
        try {
          const google = await googleSuggest(query, session.current, near)
          if (alive) setRemote({ q: query, google, free: [] })
          return
        } catch (e) {
          // Capped (429/503) or no server: the free search below, and no more Google calls in this session.
          if (e instanceof Fallback) googleOff.current = true
        }
      }
      const free = await freePlaces(query, lang, near).catch(() => [] as Place[])
      if (alive) setRemote({ q: query, google: [], free })
    }, 300)
    return () => {
      // The answer to the previous text is ignored from now on.
      alive = false
      clearTimeout(timer)
    }
  }, [query, near, wantsPlaces])

  const fresh = wantsPlaces && remote.q === query
  const google = fresh ? remote.google : []
  const free = fresh ? remote.free : []
  // Native places.loading: a place search is due for this text and its answer has not come yet.
  const loading = wantsPlaces && !fresh
  const hasLocal = local.length > 0 || lineMatches.length > 0
  // Fuzzy stop matches ("tedu" -> "Tedaş") must not push the place people mean off the screen:
  // unless a stop or line name starts with what was typed, places come first and stops shrink to 3.
  const localStrong = local.some((s) => fold(s.name).startsWith(f)) || lineMatches.length > 0
  const placesFirst = !localStrong && google.length > 0
  const shownStops = placesFirst ? local.slice(0, 3) : local
  const nothing = !idle && !!index && !hasLocal && !loading && !google.length && !free.length

  const pick = (p: Place) => {
    rememberPlace(p)
    onPick(p)
  }
  // A stop that has a card: remembered, then its card opens (native onStop).
  const pickStop = (p: Place) => {
    rememberPlace(p)
    onStop(p)
  }
  // Native pickRecent: a station opens its card again, except as the origin, which is always a place.
  const pickRecent = (p: RecentPlace) => (p.station && !origin ? pickStop(p) : pick(p))

  // Native pickGoogle: the session ends with the details call. If the details fail, the same name is found for free.
  const pickGoogle = async (s: Suggestion) => {
    const token = session.current
    session.current = newSession()
    try {
      const p = await googlePlace(s.id, token)
      pick({ ...p, name: s.name || p.name, sub: s.sub || p.sub })
    } catch {
      const alt = await freePlaces(`${s.name} ${s.sub.split(',')[0] ?? ''}`.trim(), lang, near).catch(() => [] as Place[])
      if (alt[0]) pick({ ...alt[0], name: s.name })
    }
  }

  const distanceText = (p: Place) => (near ? formatDistance(distanceM(near[1], near[0], p.lat, p.lon)) : undefined)

  const localBlock = (
    <>
      <div className="result-head section-label">
        <span>{t('stopsAndLines')}</span>
      </div>
      {lineMatches.length > 0 && (
        <ul className="results">
          {lineMatches.map((l) => (
            <li key={`l-${l.id}`}>
              <button className="result line-result" onClick={() => onLine(l.id)} aria-label={`${l.name} ${l.long_name}`}>
                <span className="line-chip-box">
                  <LineChip name={l.name} line={l} />
                </span>
                <span className="line-name">{l.long_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="results">
        {shownStops.map((s, i) => {
          const b = MODE_BADGE[s.mode ?? 'bus']
          return (
            <ResultRow
              key={`s-${i}-${s.name}`}
              icon={b.icon}
              tint={b.tint}
              name={s.name}
              sub={stopSubline(s.code, s.lines)}
              distance={s.distance !== undefined ? formatDistance(s.distance) : undefined}
              onPress={() => (s.code ? pickStop(s) : pick(s))}
            />
          )
        })}
      </ul>
    </>
  )

  const placesBlock = (google.length > 0 || free.length > 0 || loading) && (
    <>
      <div className="result-head section-label">
        <span>{t('placesSection')}</span>
      </div>
      {loading && !google.length && !free.length && (
        <p aria-live="polite" className="state-msg">
          {t('searching')}
        </p>
      )}
      <ul className="results">
        {google.map((s) => {
          const b = CATEGORY_BADGE[categoryOf(s.types)]
          return (
            <ResultRow
              key={s.id}
              icon={b.icon}
              tint={b.tint}
              name={s.name}
              sub={s.sub}
              distance={s.distance !== undefined ? formatDistance(s.distance) : undefined}
              onPress={() => pickGoogle(s)}
            />
          )
        })}
        {free.map((p, i) => (
          <ResultRow
            key={`f-${i}`}
            icon="pin"
            tint={CATEGORY_BADGE.other.tint}
            name={p.name}
            sub={p.sub}
            distance={p.distance !== undefined ? formatDistance(p.distance) : undefined}
            onPress={() => pick(p)}
          />
        ))}
      </ul>
    </>
  )

  return (
    <>
      <div className="search-head">
        <div className="search-box">
          <Icon name="search" size={20} />
          <input
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={title}
            aria-label={title}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" aria-label={t('clear')} onClick={() => setQuery('')}>
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        {/* Native search: "Vazgeç" (cancel) closes the search, the field stays a field. */}
        <button className="search-cancel" onClick={onBack}>
          {t('cancel')}
        </button>
      </div>

      {me && idle && (
        <ul className="results">
          <ResultRow icon="navigate" tint="var(--accent)" name={t('myLocation')} onPress={() => onPick(me)} />
        </ul>
      )}

      {idle && frequent.length > 0 && (
        <>
          <div className="result-head section-label">
            <span>{t('frequent')}</span>
          </div>
          <ul className="results">
            {frequent.map((p, i) => (
              <ResultRow
                key={`fr-${i}`}
                icon={p.station ? stationIcon(p.station.mode) : 'star'}
                tint="var(--accent)"
                name={p.name}
                sub={p.station ? t('stopCard') : p.sub}
                distance={distanceText(p)}
                onPress={() => pickRecent(p)}
              />
            ))}
          </ul>
        </>
      )}

      {idle && recent.length > 0 && (
        <>
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
          <ul className="results">
            {recent.map((p, i) => (
              <ResultRow
                key={`r-${i}`}
                icon={p.station ? stationIcon(p.station.mode) : 'clock'}
                tint="var(--text-2)"
                name={p.name}
                sub={p.station ? t('stopCard') : p.sub}
                distance={distanceText(p)}
                onPress={() => pickRecent(p)}
              />
            ))}
          </ul>
        </>
      )}

      {indexError && !idle && <p className="state-msg">{t('dataUnavailable')}</p>}

      {placesFirst && placesBlock}
      {hasLocal && localBlock}
      {!placesFirst && placesBlock}

      {nothing && (
        <p aria-live="polite" className="state-msg">
          {t('noResults')}
        </p>
      )}

      {onPickOnMap && (
        <ul className="results">
          <ResultRow icon="pin" tint="var(--text-2)" name={t('pickOnMap')} sub={t('pickOnMapSub')} onPress={onPickOnMap} />
        </ul>
      )}
      {google.length > 0 && <p className="attribution">{t('byGoogle')}</p>}
    </>
  )
}

/** One result row: a round badge, the name, a detail line and a distance (native PlaceRow). */
function ResultRow({
  icon,
  tint,
  name,
  sub,
  distance,
  onPress,
}: {
  icon: IconName
  tint: string
  name: string
  sub?: string
  distance?: string
  onPress: () => void
}) {
  return (
    <li>
      <button className="result" onClick={onPress}>
        <PlaceBadge icon={icon} tint={tint} />
        <span className="result-text">
          <span className="result-name">{name}</span>
          {sub && <span className="result-sub">{sub}</span>}
        </span>
        {distance && <span className="result-distance">{distance}</span>}
      </button>
    </li>
  )
}
