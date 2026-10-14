import { useEffect, useMemo, useState } from 'react'
import { PanelHeader } from '../components/PanelHeader'
import { LineChip } from '../components/LineChip'
import { Icon } from '../components/Icon'
import { Skeleton } from '../components/Skeleton'
import { loadLines, type Line } from '../lib/data'
import { lineRows, MAX_ROWS_UNFILTERED, modesPresent, sortLines, type LineFilter } from '../lib/lineList'
import { frequentLines } from '../lib/recent'
import { t, type StringKey } from '../i18n'
import './Lines.css'

// Filter chips in native order. A chip shows only when the city has that mode (native FILTERS).
const FILTERS: { key: LineFilter; label: StringKey }[] = [
  { key: 'all', label: 'allModes' },
  { key: 'metro', label: 'modeMetro' },
  { key: 'tram', label: 'modeTram' },
  { key: 'bus', label: 'modeBus' },
  { key: 'ferry', label: 'modeFerry' },
  { key: 'rail', label: 'modeRailCity' },
]

export function Lines({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [error, setError] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<LineFilter>('all')
  // Lines opened most often on this phone, shown first while nothing is typed.
  const [frequentIds] = useState(() => frequentLines(3))

  useEffect(() => {
    loadLines().then(setLines, () => setError(true))
  }, [])

  const sorted = useMemo(() => (lines ? sortLines(lines) : []), [lines])
  const frequent = useMemo(() => frequentIds.map((id) => sorted.find((l) => l.id === id)).filter((l): l is Line => !!l), [frequentIds, sorted])
  // Only the modes this city has (Bursa has no ferry or suburban rail); all of them while lines load.
  const filters = useMemo(() => {
    if (!lines?.length) return FILTERS
    const present = modesPresent(lines)
    return FILTERS.filter((fi) => fi.key === 'all' || present.has(fi.key))
  }, [lines])
  const rows = useMemo(() => lineRows(sorted, q, filter), [sorted, q, filter])
  const showFrequent = !q && filter === 'all' && frequent.length > 0
  // The unfiltered list is capped; the rest is found by typing (native).
  const capped = !q && filter === 'all' && rows.length >= MAX_ROWS_UNFILTERED

  return (
    <>
      <PanelHeader title={t('linesTitle')} onClose={onBack} />
      <div className="search-box lines-search">
        <Icon name="search" size={20} />
        <input
          type="search"
          placeholder={t('linePlaceholder')}
          aria-label={t('linePlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          enterKeyHint="search"
        />
      </div>
      <div className="filters" role="group" aria-label={t('linesTitle')}>
        {filters.map((fi) => {
          const on = fi.key === filter
          return (
            <button key={fi.key} className={on ? 'filter on' : 'filter'} aria-pressed={on} onClick={() => setFilter(fi.key)}>
              {t(fi.label)}
            </button>
          )
        })}
      </div>
      {error && (
        <p aria-live="polite" className="state-msg">
          {t('dataUnavailable')}
        </p>
      )}
      {!lines && !error && <Skeleton rows={6} height={44} />}
      {showFrequent && (
        <section className="line-group">
          <h2 className="section-label">{t('frequent')}</h2>
          <ul className="results lines-list">
            {frequent.map((l) => (
              <LineRow key={l.id} line={l} onOpen={onOpen} />
            ))}
          </ul>
          <h2 className="section-label">{t('allLines')}</h2>
        </section>
      )}
      {lines && rows.length === 0 && (
        <p aria-live="polite" className="state-msg">
          {t('noResults')}
        </p>
      )}
      <ul className="results lines-list">
        {rows.map((l) => (
          <LineRow key={l.id} line={l} onOpen={onOpen} />
        ))}
      </ul>
      {capped && (
        <p aria-live="polite" className="state-msg">
          {t('typeToFindBus')}
        </p>
      )}
    </>
  )
}

function LineRow({ line, onOpen }: { line: Line; onOpen: (id: string) => void }) {
  return (
    <li>
      <button className="result" onClick={() => onOpen(line.id)} aria-label={`${line.name} ${line.long_name}`}>
        <LineChip name={line.name} line={line} />
        <span className="lines-name">{line.long_name}</span>
      </button>
    </li>
  )
}
