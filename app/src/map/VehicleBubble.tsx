import { useEffect, useState } from 'react'
import { CrowdBadge } from '../components/CrowdBadge'
import { Icon } from '../components/Icon'
import { LineChip } from '../components/LineChip'
import { busFacts, busLabel, busTitle, busTitleLines } from '../lib/bubble'
import { loadLines, type Line } from '../lib/data'
import { ago } from '../lib/eta'
import { crowding, type Vehicle } from '../lib/live'
import { useNow } from '../lib/useNow'
import { t } from '../i18n'
import './VehicleBubble.css'

/**
 * The card above a tapped live bus (native VehicleBubble). MapView places it on the map, anchored at
 * the bus, and it follows the bus. Tapping the card, or Escape, closes it. It is not a sheet.
 */
export function VehicleBubble({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [line, setLine] = useState<Line | null>(null)
  useEffect(() => {
    loadLines().then(
      (ls) => setLine(ls.find((l) => l.name === vehicle.line && l.mode === 'bus') ?? ls.find((l) => l.name === vehicle.line) ?? null),
      () => {},
    )
  }, [vehicle.line])
  const now = useNow(1000)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const facts = busFacts(vehicle)
  // Bursa only: card taps this trip (BURULAŞ). Other cities send no count.
  const crowd = crowding(vehicle.tripBoardings)
  return (
    <button type="button" className="bus-bubble" aria-label={busLabel(vehicle, facts)} onClick={onClose}>
      <span className="bus-card">
        <span className="bus-head">
          <LineChip name={vehicle.line} line={line ?? undefined} />
          <span className="bus-title" style={{ WebkitLineClamp: busTitleLines(!!crowd) }}>
            {busTitle(line?.long_name, vehicle.headsign)}
          </span>
          {crowd && <CrowdBadge level={crowd} />}
        </span>
        <span className="bus-live">
          <Icon name="signal" size={12} />
          <span>
            {t('live')} · {ago(vehicle.at, now)}
          </span>
        </span>
        {facts.length > 0 && <span className="bus-facts">{facts.join(' · ')}</span>}
      </span>
      <span className="bus-tail" aria-hidden="true" />
    </button>
  )
}
