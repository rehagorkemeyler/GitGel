import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { t } from '../i18n'
import './PanelHeader.css'

type Props = {
  title: string
  subtitle?: string
  onClose: () => void
  /** Shown before the title (a line chip). */
  leading?: ReactNode
  /** Shown after the title (a stop code). */
  trailing?: ReactNode
  /** The 22 px title of cards (native PanelHeader small). */
  small?: boolean
}

/** Native PanelHeader: large title (30 px bold), optional secondary subtitle, round 32 px close on the right. */
export function PanelHeader({ title, subtitle, onClose, leading, trailing, small }: Props) {
  return (
    <header className="panel-head">
      <div className="panel-title">
        <div className="panel-title-row">
          {leading}
          <h1 className={small ? 'small' : undefined}>{title}</h1>
          {trailing}
        </div>
        {subtitle && <p className="panel-sub">{subtitle}</p>}
      </div>
      <CloseButton onClose={onClose} />
    </header>
  )
}

/** Native close: round 32 px, fill background, grey X, 8 px extra touch area. */
export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="round-close" onClick={onClose} aria-label={t('close')}>
      <Icon name="close" size={18} />
    </button>
  )
}
