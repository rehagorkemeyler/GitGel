import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { t } from '../i18n'
import './Panel.css'

/** Full-height panel for secondary screens, opened only by the user. */
export function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <section className="panel" aria-label={title}>
      <header className="panel-head">
        <button className="panel-back" onClick={onBack} aria-label={t('back')}>
          <Icon name="back" />
        </button>
        <h1>{title}</h1>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
