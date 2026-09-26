import { useEffect, useState } from 'react'
import { LineChip } from '../components/LineChip'
import { trip, type LegPlace } from '../lib/api'
import { hhmm } from '../lib/itinerary'
import type { TrainInfo } from '../map/railLayer'
import { t } from '../i18n'
import { useNow } from '../lib/useNow'
import './StationSheet.css'

/** Info for a scheduled train on the map: line, direction, where it is, next stops. Never "live". */
export function TrainSheet({ train, onClose }: { train: TrainInfo; onClose: () => void }) {
  const [detail, setDetail] = useState<{ id: string; headsign: string; next: LegPlace[] } | null>(null)
  useEffect(() => {
    let alive = true
    trip(train.id).then(
      (it) => {
        const leg = it.legs.find((l) => l.mode !== 'WALK')
        if (!alive || !leg) return
        const all = [leg.from, ...(leg.intermediateStops ?? []), leg.to]
        const now = Date.now()
        const next = all.filter((p) => Date.parse(p.arrival ?? p.departure ?? '') >= now - 30_000).slice(0, 6)
        setDetail({ id: train.id, headsign: leg.headsign ?? leg.to.name, next })
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [train.id])
  const now = useNow(10_000)
  const d = detail?.id === train.id ? detail : null
  const eta = Math.max(0, Math.round((train.arr - now) / 60000))
  return (
    <div className="station">
      <div className="station-head">
        <div className="station-title">
          <div className="ride-line">
            <LineChip name={train.line} color={train.color.replace('#', '')} textColor="ffffff" />
            <strong>{d ? `${d.headsign} ${t('direction')}` : '…'}</strong>
          </div>
          <span className="muted">
            {train.from} → {train.to}
          </span>
        </div>
        <button className="close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      <p className="train-eta">
        {train.to}: <strong>{eta <= 0 ? t('arriving') : `${eta} ${t('min')}`}</strong> ({hhmm(new Date(train.arr))})
      </p>
      {d && d.next.length > 0 && (
        <ul className="dep-groups">
          {d.next.map((p, i) => (
            <li key={i} className="dep-group">
              <span className="dep-head">{p.name}</span>
              <span className="dep-times">
                <span className={i === 0 ? 'first' : ''}>{hhmm(new Date(p.arrival ?? p.departure ?? ''))}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small-note">{t('trainScheduledNote')}</p>
    </div>
  )
}
