import { useEffect, useMemo, useState } from 'react'
import { Panel } from '../components/Panel'
import { LineChip } from '../components/LineChip'
import { loadJson, loadLines, loadStops, type Line } from '../lib/data'
import { fold, type Mode } from '../lib/search'
import { t, type StringKey } from '../i18n'
import './Lines.css'

type LineDetail = Line & {
  directions: { headsign: string; stops: string[]; first_last: Partial<Record<'weekday' | 'saturday' | 'sunday', [string, string]>> }[]
}

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

export function Lines({ onBack }: { onBack: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [error, setError] = useState(false)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

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

  if (openId) return <LinePage id={openId} onBack={() => setOpenId(null)} />

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
                <button className="result" onClick={() => setOpenId(l.id)}>
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

function LinePage({ id, onBack }: { id: string; onBack: () => void }) {
  const [line, setLine] = useState<LineDetail | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [dir, setDir] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadJson<LineDetail>(`lines/${id}.json`).then(setLine, () => setError(true))
    loadStops().then((s) => setNames(new Map(s.map((x) => [x.id, x.name]))), () => {})
  }, [id])

  const d = line?.directions[dir]
  return (
    <Panel title={line ? line.name : '…'} onBack={onBack}>
      {error && <p className="muted">{t('dataUnavailable')}</p>}
      {line && (
        <>
          <div className="line-head">
            <LineChip name={line.name} line={line} />
            <span>{line.long_name}</span>
          </div>
          {line.directions.length > 1 && (
            <div className="segmented" role="tablist">
              {line.directions.map((x, i) => (
                <button key={i} role="tab" aria-selected={i === dir} className={i === dir ? 'on' : ''} onClick={() => setDir(i)}>
                  {x.headsign || `${i + 1}`}
                </button>
              ))}
            </div>
          )}
          {d && (
            <>
              <table className="first-last">
                <thead>
                  <tr>
                    <th />
                    <th>{t('firstTrip')}</th>
                    <th>{t('lastTrip')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(['weekday', 'saturday', 'sunday'] as const).map(
                    (k) =>
                      d.first_last[k] && (
                        <tr key={k}>
                          <th>{t(k)}</th>
                          <td>{d.first_last[k]![0]}</td>
                          <td>{d.first_last[k]![1]}</td>
                        </tr>
                      ),
                  )}
                </tbody>
              </table>
              <p className="muted">{t('scheduleNote')}</p>
              <ol className="line-stops" style={{ borderColor: line.color ? `#${line.color}` : 'var(--border)' }}>
                {d.stops.map((s, i) => (
                  <li key={`${s}-${i}`}>{names.get(s) ?? '…'}</li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </Panel>
  )
}
