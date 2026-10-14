import { useState } from 'react'
import { lang, t } from '../i18n'
import { hhmm } from '../lib/itinerary'
import { istanbulDate, istanbulParts, type When } from '../lib/when'
import './WhenPicker.css'

/**
 * "Şimdi çık · Kalkış HH:MM · Varış HH:MM" (native WhenPicker). Kalkış and Varış reveal one row with a day
 * (yesterday to a week ahead) and a time; each change applies at once, with no confirm step.
 */
export function WhenPicker({ value, onChange }: { value: When; onChange: (w: When) => void }) {
  const [editing, setEditing] = useState<'depart' | 'arrive' | null>(null)
  // The day list and "now" are read once per mount, so rendering stays pure.
  const [anchor] = useState(() => Date.now())
  const shown = istanbulParts(value.kind === 'now' ? new Date(anchor) : value.at)

  const days = Array.from({ length: 9 }, (_, i) => {
    const d = new Date(anchor + (i - 1) * 86400_000)
    const iso = istanbulParts(d).day
    const label =
      i === 1 ? t('today') : i === 2 ? t('tomorrow') : d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' })
    return { iso, label }
  })
  // A day outside the list (set elsewhere) is still shown, so the select never lies.
  if (!days.some((d) => d.iso === shown.day)) days.push({ iso: shown.day, label: shown.day })

  /** Kalkış or Varış: the value takes the kind now, at the time it already has (or now). */
  const pick = (kind: 'depart' | 'arrive') => {
    setEditing(kind)
    if (value.kind !== kind) onChange({ kind, at: value.kind === 'now' ? new Date() : value.at })
  }
  /** A day or time change: the picked kind with the new Istanbul wall-clock moment. */
  const setAt = (day: string, time: string) => {
    if (editing && time) onChange({ kind: editing, at: istanbulDate(day, time) })
  }
  /** The chip text: the kind's word, with the chosen time once that kind is selected (native). */
  const label = (kind: 'depart' | 'arrive') => {
    const word = t(kind === 'depart' ? 'departAt' : 'arriveBy')
    return value.kind === kind ? `${word} ${hhmm(value.at)}` : word
  }

  return (
    <div className="when">
      <div className="when-row-chips">
        <button className={value.kind === 'now' ? 'when-chip on' : 'when-chip'} aria-pressed={value.kind === 'now'} onClick={() => { setEditing(null); onChange({ kind: 'now' }) }}>
          {t('leaveNow')}
        </button>
        <button className={value.kind === 'depart' ? 'when-chip on' : 'when-chip'} aria-pressed={value.kind === 'depart'} onClick={() => pick('depart')}>
          {label('depart')}
        </button>
        <button className={value.kind === 'arrive' ? 'when-chip on' : 'when-chip'} aria-pressed={value.kind === 'arrive'} onClick={() => pick('arrive')}>
          {label('arrive')}
        </button>
      </div>
      {editing && (
        <div className="when-fields">
          <select value={shown.day} onChange={(e) => setAt(e.target.value, shown.time)} aria-label={t('day')}>
            {days.map((d) => (
              <option key={d.iso} value={d.iso}>
                {d.label}
              </option>
            ))}
          </select>
          <input type="time" value={shown.time} onChange={(e) => setAt(shown.day, e.target.value)} aria-label={t('time')} />
        </div>
      )}
    </div>
  )
}
