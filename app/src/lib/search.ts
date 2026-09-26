// Local search over stations and stops. Tolerates missing Turkish characters
// ("kadikoy" finds "Kadıköy") and small typos ("kadıköu").

export type Mode = 'metro' | 'rail' | 'tram' | 'funicular' | 'cablecar' | 'metrobus' | 'ferry' | 'bus'

export type Place = {
  name: string
  lat: number
  lon: number
  kind: 'stop' | 'address' | 'place' | 'me'
  mode?: Mode
  lines?: string[]
  sub?: string
}

/** One search.json row: [name, folded name, lat, lon, mode, line names]. */
export type IndexRow = [string, string, number, number, Mode, string[]]

export function fold(s: string): string {
  return s
    .replace(/[ıİI]/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Edit distance with transpositions, stops early above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      rowMin = Math.min(rowMin, d[i][j])
    }
    if (rowMin > max) return max + 1
  }
  return d[a.length][b.length]
}

const MODE_RANK: Record<Mode, number> = {
  metro: 0, rail: 1, tram: 2, funicular: 3, cablecar: 4, metrobus: 5, ferry: 6, bus: 7,
}

/** Score one query word against one name word; lower is better, null = no match. */
function wordScore(q: string, w: string): number | null {
  if (w === q) return 0
  if (w.startsWith(q)) return 1
  if (q.length >= 4) {
    // Typo in what has been typed so far: compare with the same-length prefix.
    const allowed = q.length >= 7 ? 2 : 1
    if (editDistance(q, w.slice(0, q.length), allowed) <= allowed) return 3
    if (editDistance(q, w, allowed) <= allowed) return 3
  }
  if (q.length >= 3 && w.includes(q)) return 4
  return null
}

export function searchIndex(index: IndexRow[], query: string, limit = 8): Place[] {
  const q = fold(query)
  if (!q) return []
  const qWords = q.split(' ')
  const scored: [number, IndexRow][] = []
  for (const row of index) {
    const words = row[1].split(' ')
    let total = 0
    let ok = true
    for (const qw of qWords) {
      let best: number | null = null
      for (const w of words) {
        const s = wordScore(qw, w)
        if (s !== null && (best === null || s < best)) best = s
        if (best === 0) break
      }
      if (best === null) {
        ok = false
        break
      }
      total += best
    }
    if (!ok) continue
    // Whole-name prefix beats word matches; rail beats bus; shorter names first.
    if (row[1].startsWith(q)) total -= 1
    scored.push([total * 10 + MODE_RANK[row[4]] + row[1].length / 100, row])
  }
  scored.sort((a, b) => a[0] - b[0])
  return scored.slice(0, limit).map(([, r]) => ({
    name: r[0], lat: r[2], lon: r[3], kind: 'stop', mode: r[4], lines: r[5],
  }))
}
