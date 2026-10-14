import type { ChainItem } from '../lib/route'
import { Icon } from './Icon'
import { LineChip } from './LineChip'
import './RouteChain.css'

/** "4 › M2 › Marmaray › 7": walk minutes and line chips in order (native RouteChain). */
export function RouteChain({ items }: { items: ChainItem[] }) {
  return (
    <div className="route-chain">
      {items.map((x, i) => (
        <span key={i} className="chain-item">
          {i > 0 && (
            <span className="chain-sep" aria-hidden>
              ›
            </span>
          )}
          {x.kind === 'walk' ? (
            <span className="chain-walk">
              <Icon name="walk" size={15} />
              <span>{x.minutes}</span>
            </span>
          ) : (
            <LineChip name={x.name} color={x.color} textColor={x.textColor} />
          )}
        </span>
      ))}
    </div>
  )
}
