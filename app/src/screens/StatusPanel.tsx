import { PanelHeader } from '../components/PanelHeader'
import type { Status } from '../lib/live'
import { t } from '../i18n'
import './StatusPanel.css'

/** Service problems reported by Metro İstanbul, opened from the status pill (native StatusPanel). */
export function StatusPanel({ status, onClose }: { status: Status; onClose: () => void }) {
  return (
    <div className="status-panel">
      <PanelHeader title={t('tabDisruptions')} onClose={onClose} />
      {status.lines.map((l) => (
        <div key={l.line} className="status-card">
          <div className="status-card-head">
            <span className="status-card-dot" aria-hidden />
            <span className="status-card-title">{l.line}</span>
          </div>
          <p className="status-card-body">{l.message}</p>
        </div>
      ))}
      {status.announcements.map((a, i) => (
        <div key={`a-${i}`} className="status-card">
          <span className="status-card-title">{a.title}</span>
          <p className="status-card-sub">{a.text}</p>
        </div>
      ))}
      <p className="status-note">{t('scheduledHidden')}</p>
    </div>
  )
}
