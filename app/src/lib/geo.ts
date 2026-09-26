/** Straight-line distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = p2 - p1
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(a))
}

/** Rough walking minutes: streets are ~25 % longer than the straight line, 80 m per minute. */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round((m * 1.25) / 80))
}
