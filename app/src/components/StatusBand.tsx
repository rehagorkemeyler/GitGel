import { useState } from 'react'
import type { LineStatus } from '../lib/live'
import { t } from '../i18n'
import './StatusBand.css'

/** Calm, non-blocking notice for lines with a reported problem. Tap to read more. */
export function StatusBand({ lines }: { lines: LineStatus[] }) {
  const [open, setOpen] = useState(false)
  if (!lines.length) return null
  return (
    <button className={`status-band${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="status-title">
        {lines.map((l) => l.line).join(', ')}: {t('serviceNotice')}
      </span>
      {open &&
        lines.map((l) => (
          <span key={l.line} className="status-text">
            <strong>{l.line}</strong> {l.message}
          </span>
        ))}
      {open && <span className="status-text muted-small">{t('scheduledHidden')}</span>}
    </button>
  )
}
