// Metro İstanbul service status and announcements (REST, no key).

const BASE = 'https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/'

export type LineStatus = { line: string; message: string; updated: string }
export type Announcement = { title: string; text: string; lines: string[]; start: string }

async function call<T>(endpoint: string): Promise<T> {
  // The gateway fails about half of the requests: retry a few times.
  let last: unknown
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(BASE + endpoint, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } })
      if (r.ok) {
        const d = (await r.json()) as { Success: boolean; Data: T; Error?: { Message?: string } }
        if (d.Success) return d.Data
        last = new Error(d.Error?.Message ?? 'Success=false')
      } else last = new Error(`HTTP ${r.status}`)
    } catch (e) {
      last = e
    }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)))
  }
  throw last
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

type RawStatus = { LineName: string; Description: string; UpdateDate: string; IsActive?: boolean }

export function parseStatuses(raw: RawStatus[]): LineStatus[] {
  return raw
    .filter((s) => s.IsActive !== false)
    .map((s) => ({ line: s.LineName, message: stripHtml(s.Description ?? ''), updated: s.UpdateDate }))
}

export async function fetchStatus(): Promise<LineStatus[]> {
  return parseStatuses(await call<RawStatus[]>('GetServiceStatuses'))
}

type RawAnnouncement = { Title?: string; Content?: string; StartDate?: string }

/** Line codes mentioned in a text ("M7 Yıldız–Mahmutbey ..." -> ["M7"]). */
export function linesIn(text: string): string[] {
  return [...new Set(text.match(/\b(?:M\d{1,2}[AB]?|T\d|F\d|TF\d)\b/g) ?? [])]
}

export async function fetchAnnouncements(lang: 'tr' | 'en'): Promise<Announcement[]> {
  const raw = await call<RawAnnouncement[]>(`GetAnnouncements/${lang}`)
  return raw.map((a) => {
    const title = stripHtml(a.Title ?? '')
    const text = stripHtml(a.Content ?? '')
    return { title, text, lines: linesIn(title), start: a.StartDate ?? '' }
  })
}
