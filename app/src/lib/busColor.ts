import type { CityId } from './city'

// Official bus colours where the data has none (Görkem, 2 Ekim): Istanbul and Bursa buses are
// yellow; in Ankara EGO buses are red and private public buses (ÖHO, "-7" lines) are blue.
export const BUS_YELLOW = { color: 'f5b800', text: '1c1c1e' }
export const EGO_RED = { color: 'd7262e', text: 'ffffff' }
export const OHO_BLUE = { color: '1f5fbf', text: 'ffffff' }

export function isOho(name: string, longName = ''): boolean {
  return /-7$/.test(name.trim()) || /ÖHO/.test(longName)
}

/** Colour (hex without '#') and text colour of a bus line in a city. */
export function busColor(city: CityId, name: string, longName = ''): { color: string; text: string } {
  if (city === 'ankara') return isOho(name, longName) ? OHO_BLUE : EGO_RED
  return BUS_YELLOW
}
