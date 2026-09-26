import { useEffect, useMemo, useState } from 'react'
import { Panel } from '../components/Panel'
import { LineChip } from '../components/LineChip'
import { loadLines, type Line } from '../lib/data'
import { fold, type Mode } from '../lib/search'
import { t, type StringKey } from '../i18n'
import './Lines.css'

const MODE_LABEL: Record<Mode, StringKey> = {
  metro: 'modeMetro',
  rail: 'modeRail',
  tram: 'modeTram',
  funicular: 'modeFunicular',
  cablecar: 'modeCablecar',
  metrobus: 'modeMetrobus',
  ferry: 'modeFerry',
  bus: 'modeBus',
}
const MODES: Mode[] = ['metro', 'rail', 'tram', 'funicular', 'cablecar', 'metrobus', 'ferry', 'bus']
const MAX_BUS_ROWS = 60

export function Lines({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [error, setError] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    loadLines().then(setLines, () => setError(true))
  }, [])

  const groups = useMemo(() => {
    const f = fold(q)
    const match = (l: Line) => !f || fold(l.name).startsWith(f) || fold(l.long_name).includes(f)
    return MODES.map((m) => {
      const ls = (lines ?? []).filter((l) => l.mode === m && match(l))
      return { mode: m, lines: m === 'bus' && !f ? ls.slice(0, MAX_BUS_ROWS) : ls, more: m === 'bus' && !f && ls.length > MAX_BUS_ROWS }
    }).filter((g) => g.lines.length)
  }, [lines, q])

  return (
    <Panel title={t('lines')} onBack={onBack}>
      <div className="search-box">
        <input
          type="search"
          placeholder={t('linePlaceholder')}
          aria-label={t('linePlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </div>
      {error && <p className="muted">{t('dataUnavailable')}</p>}
      {groups.map((g) => (
        <section key={g.mode} className="line-group">
          <h2>{t(MODE_LABEL[g.mode])}</h2>
          <ul className="results">
            {g.lines.map((l) => (
              <li key={l.id}>
                <button className="result" onClick={() => onOpen(l.id)}>
                  <LineChip name={l.name} line={l} />
                  <span className="result-name">{l.long_name}</span>
                </button>
              </li>
            ))}
          </ul>
          {g.more && <p className="muted">{t('typeToFindBus')}</p>}
        </section>
      ))}
    </Panel>
  )
}
