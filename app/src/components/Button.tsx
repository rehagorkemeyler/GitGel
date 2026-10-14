import { Icon, type IconName } from './Icon'
import './Button.css'

/** Native Button: a full 52 px pill. Primary is the accent fill; the default is the fill colour. */
export function Button({ label, icon, primary, onClick }: { label: string; icon?: IconName; primary?: boolean; onClick: () => void }) {
  return (
    <button className={primary ? 'btn primary' : 'btn'} onClick={onClick}>
      {icon && <Icon name={icon} size={20} />}
      <span className="btn-label">{label}</span>
    </button>
  )
}
