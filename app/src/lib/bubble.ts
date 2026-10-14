// What the live bus bubble says (native src/map/LiveLayer.tsx). Pure, so it can be tested.
import { t } from '../i18n'
import type { Vehicle } from './live'

/**
 * The facts line parts: plate, speed as "42 km/sa" (no "Hız" label, native LiveLayer.tsx:46), then the
 * accessibility features. Empty parts are dropped.
 */
export function busFacts(v: Vehicle): string[] {
  return [
    v.plate,
    v.speed !== null && v.speed !== undefined ? `${Math.round(v.speed)} ${t('kmh')}` : null,
    v.features?.includes('Engelli') ? `♿ ${t('accessible')}` : null,
    v.features?.includes('Körüklü') ? t('articulated') : null,
  ].filter((part): part is string => !!part)
}

/** The card's accessible name: "line, facts" (native LiveLayer.tsx:59). */
export function busLabel(v: Vehicle, facts: string[] = busFacts(v)): string {
  return facts.length > 0 ? `${v.line}, ${facts.join(', ')}` : v.line
}

/** The title beside the line chip: the line's long name, else the headsign. An empty name falls back too (native `||`). */
export function busTitle(longName: string | null | undefined, headsign: string | null | undefined): string {
  return longName || headsign || ''
}

/** Lines the title may take: two while crowding is shown, else one (native LiveLayer.tsx:65). */
export function busTitleLines(crowded: boolean): number {
  return crowded ? 2 : 1
}
