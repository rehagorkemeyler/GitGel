import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { t } from '../i18n'
import './Panel.css'

/** Full-height panel for secondary screens, opened only by the user. Header as native PanelHeader: large title, round close button. */
export function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <section className="panel" aria-label={title}>
      <header className="panel-head">
        <h1>{title}</h1>
        <button className="panel-close" onClick={onBack} aria-label={t('close')}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
