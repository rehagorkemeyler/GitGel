// Istanbul stop board: İETT's own estimate of the buses coming to a stop, from the service behind the stop
// pages of iett.istanbul (no key; the same answer anyone gets on the site). The Istanbul counterpart of EGO's
// board (ego.ts getStopBoard), returned in the same shape so the app shows both cities with one component.
// `code` is İETT's stop number (durak kodu), which the nightly data carries as a stop's "code".

import { Upstream } from '../guard.ts'
import type { AnkaraArrival, AnkaraStopBoard } from './ego.ts'

const BASE = process.env.IETT_WEB_BASE ?? 'https://iett.istanbul'
/** Each stop is cached for 20 s and shared by all users; this caps what we send to the site. */
export const iettWebUpstream = new Upstream('İETT web', 30)

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

function text(html = ''): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** "ŞİFA SONDURAK - 4.LEVENT METRO" -> "Şifa Sondurak - 4.Levent Metro". */
function titleTr(s: string): string {
  return s.toLocaleLowerCase('tr').replace(/(^|[\s(./-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('tr'))
}

/**
 * The buses in the site's answer, soonest first. Each item is "<span>500T</span><p>FROM - TO <b>(05:27) 4 dk</b></p>".
 * Items marked "B" (not yet on the road, or no GPS signal) are left out: they are not live.
 * Throws when the answer is not a stop board at all (the site changed, or an error page).
 */
export function parseBoard(html: string): AnkaraArrival[] {
  if (!/line-list|departure-times-header/.test(html)) throw new Error('İETT web: unexpected stop answer')
  const out: AnkaraArrival[] = []
  for (const [, body] of html.matchAll(/<div class="content">([\s\S]*?)<\/div>/g)) {
    const line = text(body.match(/<span[^>]*>([\s\S]*?)<\/span>/)?.[1])
    const bold = text(body.match(/<b[^>]*>([\s\S]*?)<\/b>/)?.[1])
    const min = bold.match(/(\d+)\s*dk/i)?.[1]
    if (!line || min === undefined || /\bB\b/.test(bold)) continue
    const route = text(body.match(/<p[^>]*>([\s\S]*?)<b/)?.[1])
    out.push({ line, lineName: titleTr(route), plate: null, features: [], speed: null, etaSeconds: Number(min) * 60, stopsAway: null })
  }
  return out.sort((a, b) => a.etaSeconds - b.etaSeconds)
}

export async function getIstanbulBoard(code: string): Promise<AnkaraStopBoard> {
  iettWebUpstream.take()
  const r = await fetch(`${BASE}/tr/RouteStation/GetStationInfo?dcode=${encodeURIComponent(code)}&langid=1`, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'text/html', 'User-Agent': 'GitGel (+https://gitgel.vercel.app)' },
  })
  const html = await r.text()
  iettWebUpstream.answer(r.status, html)
  if (!r.ok) throw new Error(`İETT web HTTP ${r.status}`)
  // "Bu bilgi şu anda alınamıyor": the site has no live data for this stop right now.
  if (/live-data-unavailable/.test(html) && !/<div class="content">\s*<span/.test(html)) throw new Error('İETT web: no live data for this stop')
  return { arrivals: parseBoard(html), lines: [] }
}
