import { useEffect, useMemo, useState } from 'react'
import { PanelHeader } from '../components/PanelHeader'
import { LineChip } from '../components/LineChip'
import { CITY } from '../lib/city'
import { busColor } from '../lib/busColor'
import { loadLines, type Line } from '../lib/data'
import { distanceLabel, distanceM, walkMinutes } from '../lib/geo'
import { groupClusterStops, rowCode, sortedLines } from '../lib/stopCluster'
import type { Station } from '../map/networkLayer'
import { t } from '../i18n'
import './StopCluster.css'

/** Chips per stop before "+N": two rows across the card. */
const MAX_CHIPS = 9

type Props = {
  stops: Station[]
  /** The tapped bubble: the nearest group comes first. */
  at: { lat: number; lon: number }
  /** The user's position [lon, lat]: each stop shows its walk. */
  position: [number, number] | null
  /** A stop's card opens on top; back returns to this list. */
  onStation: (st: Station) => void
  onClose: () => void
}

/**
 * "Otobüs Durakları": the stops under a map cluster. One card per stop name; in it a row per
 * stop: its number (what is written at the stop) and walk on top, every line through it as chips below.
 */
export function StopCluster({ stops, at, position, onStation, onClose }: Props) {
  const [lineById, setLineById] = useState<Map<string, Line>>(new Map())
  useEffect(() => {
    loadLines().then((ls) => setLineById(new Map(ls.map((l) => [l.id, l]))), () => {})
  }, [])
  const groups = useMemo(() => groupClusterStops(stops, at), [stops, at])

  return (
    <>
      <PanelHeader title={t('clusterTitle')} subtitle={`${stops.length} ${t('stops')}`} onClose={onClose} />
      <div className="cluster-groups">
        {groups.map((g) => (
          <section key={g.name} className="cluster-group" aria-label={g.name}>
            <div className="cluster-head">
              <h2 className="cluster-name">{g.name}</h2>
              {groups.length > 1 && g.stops.length > 1 && <span className="cluster-count">{g.stops.length}</span>}
            </div>
            <ul className="cluster-rows">
              {g.stops.map((s) => (
                <li key={s.id}>
                  <StopRow stop={s} name={g.name} lineById={lineById} position={position} onPress={() => onStation(s)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

function StopRow({
  stop,
  name,
  lineById,
  position,
  onPress,
}: {
  stop: Station
  name: string
  lineById: Map<string, Line>
  position: [number, number] | null
  onPress: () => void
}) {
  const code = rowCode(stop.id)
  const ids = sortedLines(stop.lines)
  const shown = ids.length > MAX_CHIPS ? ids.slice(0, MAX_CHIPS - 1) : ids
  const more = ids.length - shown.length
  const m = position ? distanceM(position[1], position[0], stop.lat, stop.lon) : null
  const chips = shown.map((id) => {
    const l = lineById.get(id)
    const label = l?.name ?? id.toUpperCase()
    // Buses without a colour in the data get the city's official bus colour (as in the native app).
    const c = l?.color ? null : busColor(CITY.id, label, l?.long_name)
    return { id, label, line: l, color: c?.color, text: c?.text }
  })
  return (
    <button className="cluster-row" onClick={onPress} aria-label={[name, code, chips.map((c) => c.label).join(', ')].filter(Boolean).join(', ')}>
      <span className="cluster-top">
        <span className="cluster-tile" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M6 3h12a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.73V20h-3v-2H8v2H5v-2.27A2 2 0 0 1 4 16V5a2 2 0 0 1 2-2Zm0 3v5h12V6H6Zm1.5 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
            />
          </svg>
        </span>
        <span className="cluster-code">{code ?? name}</span>
        {m !== null && (
          <span className="cluster-walk">
            {walkMinutes(m)} {t('min')} · {distanceLabel(m)}
          </span>
        )}
        <svg className="cluster-chevron" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
          <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {chips.length > 0 && (
        <span className="cluster-chips">
          {chips.map((c) => (
            <LineChip key={c.id} name={c.label} line={c.line} color={c.color} textColor={c.text} />
          ))}
          {more > 0 && <span className="chip cluster-more">+{more}</span>}
        </span>
      )}
    </button>
  )
}
