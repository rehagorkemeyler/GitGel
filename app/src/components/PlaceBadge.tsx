import { Icon, type IconName } from './Icon'
import './PlaceBadge.css'

/** Round coloured badge with a white glyph: the native PlaceRow badge (36 px, 18 px glyph). */
export function PlaceBadge({ icon, tint }: { icon: IconName; tint: string }) {
  return (
    <span className="place-badge" style={{ background: tint }}>
      <Icon name={icon} size={18} />
    </span>
  )
}
