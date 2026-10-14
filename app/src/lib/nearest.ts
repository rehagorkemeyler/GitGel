// Which stations and stops to draw: the ones in view, nearest the centre first, capped.
// Port of the native region helpers (native src/map/region.ts), so both apps show the same markers.

/** A map view: its centre and its size in degrees. */
export type View = { lat: number; lon: number; latDelta: number; lonDelta: number }

/** True when the point lies inside the view grown by `pad` (a fraction of its size). */
export function inView(v: View, lat: number, lon: number, pad = 0.1): boolean {
  const h = (v.latDelta / 2) * (1 + pad)
  const w = (v.lonDelta / 2) * (1 + pad)
  return Math.abs(lat - v.lat) <= h && Math.abs(lon - v.lon) <= w
}

/** Items inside the view, closest to its centre first, at most `max`. */
export function visibleNearest<T extends { lat: number; lon: number }>(items: readonly T[], v: View, max: number): T[] {
  const k = Math.cos((v.lat * Math.PI) / 180)
  const inside: { item: T; d: number }[] = []
  for (const item of items) {
    if (!inView(v, item.lat, item.lon)) continue
    const dx = (item.lon - v.lon) * k
    const dy = item.lat - v.lat
    inside.push({ item, d: dx * dx + dy * dy })
  }
  inside.sort((a, b) => a.d - b.d)
  return inside.slice(0, max).map((x) => x.item)
}
