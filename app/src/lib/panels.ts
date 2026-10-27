// The panel stack of the map screen (native App.tsx Panel[]): the panel on top is what the sheet shows.
import type { Itinerary } from './api'
import type { Station } from '../map/networkLayer'
import type { TrainInfo } from '../map/railLayer'
import { SNAP } from './sheet'

export type Panel = (
  | { kind: 'home' }
  | { kind: 'status' }
  | { kind: 'city' }
  | { kind: 'search'; which: 'to' | 'from' }
  | { kind: 'results' }
  | { kind: 'route'; it: Itinerary }
  | { kind: 'station'; station: Station }
  | { kind: 'stops'; stops: Station[]; at: { lat: number; lon: number } }
  | { kind: 'line'; id: string; dir: number }
  | { kind: 'train'; train: TrainInfo }
  | { kind: 'lines' }
  | { kind: 'nearby' }
  | { kind: 'contact' }
  | { kind: 'support' }
  | { kind: 'about' }
) & {
  /** Sheet height (px) this panel had when another one covered it: restored on "back". */
  snapH?: number
}

/** Trip panels: closing a trip removes them and keeps the rest of the stack. */
export function isTrip(p: Panel): boolean {
  return p.kind === 'results' || p.kind === 'route' || p.kind === 'search'
}

/** The snap a panel opens at (native defaultSnap): home at the peek, search and about full, lists at 65%, the rest at the default. */
export function defaultSnapOf(p: Panel): number {
  switch (p.kind) {
    case 'home':
      return SNAP.peek
    case 'search':
    case 'about':
      return SNAP.full
    case 'lines':
    case 'nearby':
    case 'stops':
    case 'contact':
    case 'support':
      return SNAP.mid
    default:
      return SNAP.def
  }
}

/** Keeps the panels that `keep` allows and opens `top` on them (native resetTo). Home is never lost. */
export function resetPanels(stack: Panel[], keep: (p: Panel) => boolean, top: Panel | null): Panel[] {
  const base = stack.filter(keep)
  if (top) return [...base, top]
  return base.length ? base : [{ kind: 'home' }]
}

/** Back: the panel below comes back. Home is the bottom of the stack. */
export function popPanels(stack: Panel[]): Panel[] {
  return stack.length > 1 ? stack.slice(0, -1) : stack
}
