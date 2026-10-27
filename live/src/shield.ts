// Keeps the live API for GitGel's own clients. Three layers, each cheap and dependency-free:
//  - the client IP comes from the proxy's own X-Forwarded-For entry, never from a header the client can
//    set (Tailscale Funnel passes CF-Connecting-IP through, so trusting it let anyone pick their IP);
//  - browsers may call us only from our own origins (CORS allowlist; the native app sends no Origin);
//  - per-IP budget, and no answers at all to cloud data-centre ranges (Google, GCP, AWS EC2): real riders
//    are on mobile and home networks, while another app's server-side proxy runs in a cloud.
// None of this hides the endpoints: anything the app calls is visible to anyone who inspects it. It limits
// who can use them, and how much.

import { BlockList, isIP } from 'node:net'
import type { IncomingMessage } from 'node:http'

/** The proxy appends the address it saw as the last X-Forwarded-For entry; everything before it is client-supplied. */
export function clientIp(req: IncomingMessage, trustCloudflare = process.env.TRUST_CF_HEADER === '1'): string {
  const headers = req.headers ?? {}
  if (trustCloudflare) {
    const cf = headers['cf-connecting-ip']
    if (typeof cf === 'string' && cf) return normalize(cf)
  }
  const xff = headers['x-forwarded-for']
  if (typeof xff === 'string' && xff) {
    const last = xff.split(',').at(-1)?.trim()
    if (last) return normalize(last)
  }
  return normalize(req.socket?.remoteAddress ?? '?')
}

const LOCAL = new BlockList()
for (const [net, len] of [['127.0.0.0', 8], ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10]] as const)
  LOCAL.addSubnet(net, len, 'ipv4')
LOCAL.addSubnet('::1', 128, 'ipv6')
LOCAL.addSubnet('fc00::', 7, 'ipv6')

/** A proxy hop or a missing X-Forwarded-For: not a client we can tell apart, so budgets would hit everyone at once. */
export function isLocal(ip: string): boolean {
  const family = isIP(ip)
  return family === 0 || LOCAL.check(ip, family === 4 ? 'ipv4' : 'ipv6')
}

function normalize(ip: string): string {
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip
}

const DEFAULT_ORIGINS = ['https://gitgel.vercel.app', 'https://gitgel-pwa.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
/** Vercel's per-deployment addresses of our own project (gitgel-<hash>-gorkem6.vercel.app), for trying a build. */
const OWN_PREVIEW = /^https:\/\/gitgel(-pwa)?-[a-z0-9-]+-gorkem6\.vercel\.app$/

/** A browser origin that may call the live API: one of `origins`, or a preview of our own Vercel project. */
export function originAllowed(origins: Set<string>, origin: string): boolean {
  return origins.has(origin) || OWN_PREVIEW.test(origin)
}

export function allowedOrigins(env = process.env.ALLOWED_ORIGINS): Set<string> {
  const list = env ? env.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean) : DEFAULT_ORIGINS
  return new Set(list)
}

/** Per-IP token bucket. Generous, because Turkish mobile carriers put many riders behind one CGNAT address. */
export class ClientBudget {
  private readonly perMinute: number
  private readonly now: () => number
  private buckets = new Map<string, { tokens: number; at: number }>()

  constructor(perMinute = Number(process.env.CLIENT_PER_MINUTE) || 300, now = () => Date.now()) {
    this.perMinute = perMinute
    this.now = now
  }

  allow(ip: string): boolean {
    const t = this.now()
    let b = this.buckets.get(ip)
    if (!b) {
      if (this.buckets.size > 50_000) this.buckets.clear()
      b = { tokens: this.perMinute, at: t }
      this.buckets.set(ip, b)
    }
    b.tokens = Math.min(this.perMinute, b.tokens + ((t - b.at) / 60_000) * this.perMinute)
    b.at = t
    if (b.tokens < 1) return false
    b.tokens--
    return true
  }
}

type Prefixes = { v4: string[]; v6: string[] }

/** Google Cloud's customer ranges (https://www.gstatic.com/ipranges/cloud.json). */
export function parseGcp(json: unknown): Prefixes {
  const out: Prefixes = { v4: [], v6: [] }
  for (const p of (json as { prefixes?: Record<string, string>[] })?.prefixes ?? []) {
    if (p.ipv4Prefix) out.v4.push(p.ipv4Prefix)
    if (p.ipv6Prefix) out.v6.push(p.ipv6Prefix)
  }
  return out
}

/** AWS EC2 only (https://ip-ranges.amazonaws.com/ip-ranges.json); other AWS services carry user traffic. */
export function parseAws(json: unknown): Prefixes {
  const j = json as { prefixes?: Record<string, string>[]; ipv6_prefixes?: Record<string, string>[] }
  return {
    v4: (j?.prefixes ?? []).filter((p) => p.service === 'EC2').map((p) => p.ip_prefix),
    v6: (j?.ipv6_prefixes ?? []).filter((p) => p.service === 'EC2').map((p) => p.ipv6_prefix),
  }
}

const SOURCES: Record<string, { url: string; parse: (j: unknown) => Prefixes }> = {
  gcp: { url: 'https://www.gstatic.com/ipranges/cloud.json', parse: parseGcp },
  // All of Google's own networks: Cloud Run and Cloud Functions egress from here, not from cloud.json.
  google: { url: 'https://www.gstatic.com/ipranges/goog.json', parse: parseGcp },
  aws: { url: 'https://ip-ranges.amazonaws.com/ip-ranges.json', parse: parseAws },
}

export class CloudBlock {
  private list = new BlockList()
  private count = 0

  load(prefixes: Prefixes) {
    const list = new BlockList()
    let n = 0
    for (const [family, items] of [['ipv4', prefixes.v4], ['ipv6', prefixes.v6]] as const) {
      for (const cidr of items) {
        const [net, len] = cidr.split('/')
        if (!net || !len || isIP(net) === 0) continue
        list.addSubnet(net, Number(len), family)
        n++
      }
    }
    this.list = list
    this.count = n
  }

  blocked(ip: string): boolean {
    const family = isIP(ip)
    if (!family || !this.count) return false
    return this.list.check(ip, family === 4 ? 'ipv4' : 'ipv6')
  }

  get size() {
    return this.count
  }

  /** Loads the configured clouds now and once a day. A failed refresh keeps the last good list. */
  start(clouds = (process.env.BLOCK_CLOUDS || 'gcp,google,aws').split(',').map((c) => c.trim()).filter((c) => SOURCES[c])) {
    const refresh = async () => {
      const merged: Prefixes = { v4: [], v6: [] }
      for (const c of clouds) {
        try {
          const r = await fetch(SOURCES[c].url, { signal: AbortSignal.timeout(20_000) })
          const p = SOURCES[c].parse(await r.json())
          merged.v4.push(...p.v4)
          merged.v6.push(...p.v6)
        } catch (e) {
          console.warn(`shield: ${c} ranges not refreshed: ${e instanceof Error ? e.message : e}`)
        }
      }
      if (merged.v4.length + merged.v6.length) {
        this.load(merged)
        console.log(`shield: blocking ${this.count} cloud ranges (${clouds.join(', ')})`)
      }
    }
    void refresh()
    setInterval(refresh, 24 * 3600_000).unref()
  }
}
