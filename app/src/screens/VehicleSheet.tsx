import { useEffect, useState } from 'react'
import { LineChip } from '../components/LineChip'
import { loadLines, type Line } from '../lib/data'
import type { Vehicle } from '../lib/live'
import { useNow } from '../lib/useNow'
import { ago } from '../lib/eta'
import { t } from '../i18n'
import './StationSheet.css'

/** Tapped live bus: line, plate, speed, how fresh the position is. */
export function VehicleSheet({ vehicle, onClose, onLine }: { vehicle: Vehicle; onClose: () => void; onLine: (id: string) => void }) {
  const [line, setLine] = useState<Line | null>(null)
  useEffect(() => {
    loadLines().then((ls) => setLine(ls.find((l) => l.name === vehicle.line && l.mode === 'bus') ?? ls.find((l) => l.name === vehicle.line) ?? null), () => {})
  }, [vehicle.line])
  const now = useNow(1000)
  const facts = [
    vehicle.plate,
    vehicle.speed !== null && vehicle.speed !== undefined ? `${t('speed')} ${Math.round(vehicle.speed)} ${t('kmh')}` : null,
    vehicle.features?.includes('Engelli') ? `♿ ${t('accessible')}` : null,
    vehicle.features?.includes('Körüklü') ? t('articulated') : null,
  ].filter(Boolean)
  return (
    <div className="station">
      <div className="station-head">
        <div className="station-title">
          <div className="ride-line">
            <LineChip name={vehicle.line} line={line ?? undefined} />
            <strong>{line?.long_name ?? vehicle.headsign}</strong>
          </div>
          <span className="muted">
            <i className="dot live" aria-hidden /> {t('liveBus')} · {ago(vehicle.at, now)}
          </span>
        </div>
        <button className="close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      {facts.length > 0 && <p>{facts.join(' · ')}</p>}
      {line && (
        <button className="directions" onClick={() => onLine(line.id)}>
          {t('openLine')}
        </button>
      )}
    </div>
  )
}
