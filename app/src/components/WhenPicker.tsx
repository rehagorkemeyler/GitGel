import { useState } from 'react'
import { lang, t } from '../i18n'
import { istanbulDate, istanbulParts, whenLabel, type When } from '../lib/when'
import './WhenPicker.css'

/** "Leave now / Depart at / Arrive by" + day + time, like Google Maps. */
export function WhenPicker({ value, onChange }: { value: When; onChange: (w: When) => void }) {
  const [open, setOpen] = useState(false)
  const now = new Date()
  const initial = istanbulParts(value.kind === 'now' ? now : value.at)
  const [kind, setKind] = useState<When['kind']>(value.kind)
  const [day, setDay] = useState(initial.day)
  const [time, setTime] = useState(initial.time)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() + i * 86400_000)
    const { day: iso } = istanbulParts(d)
    const label =
      i === 0 ? t('today') : i === 1 ? t('tomorrow') : d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { weekday: 'long', timeZone: 'Europe/Istanbul' })
    return { iso, label }
  })

  if (!open) {
    return (
      <button className="when-chip" onClick={() => setOpen(true)} aria-expanded={false}>
        {whenLabel(value)} ▾
      </button>
    )
  }
  return (
    <div className="when-panel">
      <div className="segmented" role="tablist">
        {(['now', 'depart', 'arrive'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {t(k === 'now' ? 'leaveNow' : k === 'depart' ? 'departAt' : 'arriveBy')}
          </button>
        ))}
      </div>
      {kind !== 'now' && (
        <div className="when-fields">
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label={t('day')}>
            {days.map((d) => (
              <option key={d.iso} value={d.iso}>
                {d.label}
              </option>
            ))}
          </select>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('time')} />
        </div>
      )}
      <button
        className="when-done"
        onClick={() => {
          onChange(kind === 'now' ? { kind: 'now' } : { kind, at: istanbulDate(day, time) })
          setOpen(false)
        }}
      >
        {t('done')}
      </button>
    </div>
  )
}
