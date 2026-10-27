import { useEffect, useMemo, useState } from 'react'
import { PanelHeader } from '../components/PanelHeader'
import { LineChip } from '../components/LineChip'
import { lineColors, type Line } from '../lib/data'
import { groupClusterStops, rowCode, sortedLines } from '../lib/stopCluster'
import type { Station } from '../map/networkLayer'
import { t } from '../i18n'
import './StopCluster.css'

/** Chips shown per stop before "+N": four fit a phone row next to the stop number. */
const MAX_CHIPS = 4

type Props = {
  stops: Station[]
  /** The tapped bubble: the nearest group comes first. */
  at: { lat: number; lon: number }
  /** A stop's card opens on top; back returns to this list. */
  onStation: (st: Station) => void
  onClose: () => void
}

/** "Buradaki otobüs durakları": the stops under a map cluster, one card per stop name, a row per stop. */
export function StopCluster({ stops, at, onStation, onClose }: Props) {
  const [lineById, setLineById] = useState<Map<string, Line>>(new Map())
  useEffect(() => {
    lineColors().then((m) => setLineById(new Map([...m.values()].map((l) => [l.id, l]))), () => {})
  }, [])
  const groups = useMemo(() => groupClusterStops(stops, at), [stops, at])

  return (
    <>
      <PanelHeader title={t('clusterTitle')} subtitle={`${stops.length} ${t('stops')}`} onClose={onClose} />
      <div className="cluster-groups">
        {groups.map((g) => (
          <section key={g.name} className="cluster-group" aria-label={g.name}>
            <h2 className="cluster-name">{g.name}</h2>
            <ul className="cluster-rows">
              {g.stops.map((s) => {
                const code = rowCode(s.id)
                const lines = sortedLines(s.lines)
                const more = lines.length - MAX_CHIPS
                const names = lines.map((id) => lineById.get(id)?.name ?? id.toUpperCase())
                return (
                  <li key={s.id}>
                    <button
                      className="cluster-row"
                      onClick={() => onStation(s)}
                      aria-label={[g.name, code, names.join(', ')].filter(Boolean).join(', ')}
                    >
                      {code && <span className="cluster-code">{code}</span>}
                      <span className="cluster-chips">
                        {lines.slice(0, more > 1 ? MAX_CHIPS : MAX_CHIPS + 1).map((id, i) => (
                          <LineChip key={id} name={names[i]} line={lineById.get(id)} />
                        ))}
                        {more > 1 && <span className="cluster-more">+{more}</span>}
                      </span>
                      <svg className="cluster-chevron" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
                        <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
