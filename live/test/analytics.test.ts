import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Analytics, IntakeLimit, RETENTION_DAYS, dayOf, parseUa, toCell, toRow } from '../src/analytics.ts'
import { adminHandler, allowedLogins, rangeOf } from '../src/admin.ts'
import { MmdbReader, ipv6Bytes } from '../src/geo.ts'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

test('user agents: device, model, OS, browser', () => {
  assert.deepEqual(parseUa(IPHONE), { device: 'Telefon', model: 'iPhone', os: 'iOS 18.5', browser: 'Safari' })
  assert.deepEqual(parseUa(SAMSUNG), { device: 'Telefon', model: 'SM-S918B', os: 'Android 14', browser: 'Chrome' })
  assert.equal(parseUa(INSTAGRAM).browser, 'Instagram')
  assert.deepEqual(parseUa(MAC), { device: 'Masaüstü', model: '', os: 'macOS 10.15', browser: 'Chrome' })
  assert.equal(parseUa('Googlebot/2.1 (+http://www.google.com/bot.html)').device, 'Bot')
})

test('user agents: the native app is a phone, not a desktop', () => {
  assert.deepEqual(parseUa('okhttp/4.12.0'), { device: 'Telefon', model: '', os: 'Android', browser: 'GitGel uygulaması' })
  assert.deepEqual(parseUa('GitGel/12 CFNetwork/1568.100.1 Darwin/24.0.0'), { device: 'Telefon', model: '', os: 'iOS', browser: 'GitGel uygulaması' })
  assert.equal(parseUa('GitGel/1.0 (Android 14)').os, 'Android 14')
  assert.equal(parseUa(`${SAMSUNG} GitGel/1.0`).browser, 'GitGel uygulaması')
})

const ev = (over: Record<string, unknown> = {}) => ({ v: 'visitor-0001', s: 'session-0001', t: 'pageview', p: '/GitGel/', ...over })

test('incoming events are validated and trimmed', () => {
  assert.equal(toRow(ev({ v: 'x' }), '1.2.3.4', IPHONE, {}, 0), undefined)
  assert.equal(toRow(ev({ t: 'drop table' }), '1.2.3.4', IPHONE, {}, 0), undefined)
  const r = toRow(ev({ q: 'a'.repeat(500), u: { source: 'instagram', campaign: 'launch' }, w: '390x844', c: 'istanbul' }), '1.2.3.4', IPHONE, { country: 'TR', city: 'Istanbul' }, 5)!
  assert.equal(r.q.length, 100)
  assert.equal(r.utm_source, 'instagram')
  assert.equal(r.utm_campaign, 'launch')
  assert.equal(r.city, 'Istanbul')
  assert.equal(r.screen, '390x844')
  assert.equal(toRow(ev({ w: '<script>' }), '1.2.3.4', IPHONE, {}, 0)!.screen, '')
})

test('store: totals, tops, visitors, retention and daily rollup', () => {
  const a = new Analytics(':memory:')
  const now = Date.parse('2026-10-16T12:00:00Z')
  const add = (over: Record<string, unknown>, t: number, ua = IPHONE, ip = '1.1.1.1') => a.insert(toRow(ev(over), ip, ua, { country: 'TR', city: 'Istanbul' }, t)!)
  add({}, now - 1000)
  add({ t: 'search', q: 'Kadıköy', pl: 'Kadıköy İskelesi' }, now - 900)
  add({ t: 'route', f: 'Konumum', to: 'Kadıköy İskelesi' }, now - 800)
  add({ v: 'visitor-0002', s: 'session-0002', u: { source: 'instagram' } }, now - 700, SAMSUNG, '2.2.2.2')
  add({ v: 'visitor-0003', s: 'session-0003' }, now - 600, 'Googlebot/2.1')
  add({ v: 'visitor-0004', s: 'session-0004' }, now - 2 * 86400_000)
  add({ v: 'visitor-0005', s: 'session-0005' }, now - (RETENTION_DAYS + 1) * 86400_000)

  const day = 86400_000
  const tot = a.totals(now - day, now)
  assert.equal(tot.visitors, 2)
  assert.equal(tot.searches, 1)
  assert.equal(tot.routes, 1)
  assert.equal(a.newVisitors(now - day, now), 3)
  assert.equal(a.activeNow(now), 3)
  assert.deepEqual(a.top('utm_source', now - day, now).map((r) => r.key), ['instagram'])
  assert.deepEqual({ ...a.top('city', now - day, now)[0] }, { key: 'Istanbul (TR)', visitors: 2, events: 2 })
  assert.deepEqual(a.topActivity('route', now - day, now).map((r) => r.key), ['Konumum → Kadıköy İskelesi'])
  assert.deepEqual(a.topActivity('q', now - day, now).map((r) => r.key), ['kadıköy'])
  assert.equal(a.visitors(now - day, now, 10, 'SM-S918').length, 1)
  assert.equal(a.visitor('visitor-0001').length, 3)
  assert.throws(() => a.top('ip; drop', 0, now))

  a.maintain(now)
  const all = a.allTime(now)
  assert.ok(all.some((d) => d.day === dayOf(now - 2 * day) && d.visitors === 1))
  assert.equal(all.at(-1)!.day, '2026-10-16')
  assert.equal(a.visitor('visitor-0005').length, 0)
  assert.ok(all.some((d) => d.day === dayOf(now - (RETENTION_DAYS + 1) * day)))
})

test('intake limit per address', () => {
  let t = 0
  const l = new IntakeLimit(2, () => t)
  assert.ok(l.allow('a') && l.allow('a'))
  assert.equal(l.allow('a'), false)
  assert.ok(l.allow('b'))
  t = 60_000
  assert.ok(l.allow('a'))
})

async function serve(handler: RequestListener): Promise<[Server, string]> {
  const s = createServer(handler)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return [s, `http://127.0.0.1:${(s.address() as AddressInfo).port}`]
}

test('admin: only listed tailnet logins, never Funnel, nothing when unconfigured', async () => {
  const a = new Analytics(':memory:')
  a.insert(toRow(ev(), '1.1.1.1', IPHONE, {}, Date.now())!)
  const [s, base] = await serve(adminHandler(a, allowedLogins(' Gorkem@Example.com ,')))
  const [s2, base2] = await serve(adminHandler(a, allowedLogins('')))
  try {
    const me = { 'Tailscale-User-Login': 'gorkem@example.com' }
    assert.equal((await fetch(base + '/')).status, 403)
    assert.equal((await fetch(base + '/', { headers: { 'Tailscale-User-Login': 'someone@else.com' } })).status, 403)
    assert.equal((await fetch(base + '/', { headers: { ...me, 'Tailscale-Funnel-Request': '?1' } })).status, 403)
    assert.equal((await fetch(base2 + '/', { headers: me })).status, 403)
    const page = await fetch(base + '/', { headers: me })
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/)
    assert.equal(page.headers.get('x-frame-options'), 'DENY')
    const sum = (await (await fetch(base + '/api/summary?days=1', { headers: me })).json()) as { totals: { visitors: number } }
    assert.equal(sum.totals.visitors, 1)
    assert.equal((await fetch(base + '/api/visitor?vid=../../x', { headers: me })).status, 400)
    assert.equal((await fetch(base + '/api/summary', { method: 'POST', headers: me })).status, 405)
  } finally {
    s.close()
    s2.close()
  }
})

test('admin range is clamped to retention', () => {
  const now = 100 * 86400_000
  assert.deepEqual(rangeOf(new URL('http://x/?days=999'), now), [now - 90 * 86400_000, now + 60_000])
  assert.deepEqual(rangeOf(new URL('http://x/?days=abc'), now), [now - 7 * 86400_000, now + 60_000])
})

function tinyMmdb(): Buffer {
  const enc = (v: unknown): Buffer => {
    if (typeof v === 'string') return Buffer.concat([Buffer.from([(2 << 5) | Buffer.byteLength(v)]), Buffer.from(v)])
    if (typeof v === 'number') return Buffer.from([(6 << 5) | 4, ...[24, 16, 8, 0].map((s) => (v >>> s) & 255)])
    const e = Object.entries(v as object)
    return Buffer.concat([Buffer.from([(7 << 5) | e.length]), ...e.flatMap(([k, x]) => [enc(k), enc(x)])])
  }
  const nodes = 32
  const ip = [1, 2, 3, 4]
  const tree = Buffer.alloc(nodes * 6)
  for (let i = 0; i < nodes; i++) {
    const bit = (ip[i >> 3] >> (7 - (i & 7))) & 1
    const next = i === nodes - 1 ? nodes + 16 : i + 1
    tree.writeUIntBE(bit === 0 ? next : nodes, i * 6, 3)
    tree.writeUIntBE(bit === 1 ? next : nodes, i * 6 + 3, 3)
  }
  const data = enc({ country: { iso_code: 'TR' }, city: { names: { en: 'Istanbul' } } })
  const meta = enc({ node_count: nodes, record_size: 24, ip_version: 4 })
  return Buffer.concat([tree, Buffer.alloc(16), data, Buffer.from([0xab, 0xcd, 0xef]), Buffer.from('MaxMind.com'), meta])
}

test('MaxMind DB reader', () => {
  const r = new MmdbReader(tinyMmdb())
  assert.deepEqual(r.lookup('1.2.3.4'), { country: { iso_code: 'TR' }, city: { names: { en: 'Istanbul' } } })
  assert.equal(r.lookup('1.2.3.5'), undefined)
  assert.equal(r.lookup('not an ip'), undefined)
  assert.deepEqual(ipv6Bytes('::ffff:1.2.3.4').slice(10), [255, 255, 1, 2, 3, 4])
  assert.equal(ipv6Bytes('2001:db8::1').length, 16)
})

test('location cells: rounded to 100 m, counted per day, no visitor', () => {
  const a = new Analytics(':memory:')
  const now = Date.parse('2026-10-16T12:00:00Z')
  assert.deepEqual(toCell(40.99123, 29.02987), [40.991, 29.03])
  assert.equal(toCell('40.9', 29), undefined)
  assert.equal(toCell(95, 29), undefined)
  assert.ok(a.addCell(40.99123, 29.02987, now))
  assert.ok(a.addCell(40.99104, 29.03011, now))
  assert.equal(a.addCell(NaN, 29, now), false)
  assert.deepEqual(a.cells(now - 86400_000, now).map((c) => ({ ...c })), [{ lat: 40.991, lon: 29.03, n: 2 }])
  const cols = (a.db.prepare("SELECT name FROM pragma_table_info('cells')").all() as { name: string }[]).map((c) => c.name)
  assert.deepEqual(cols, ['day', 'lat', 'lon', 'n'])
})
