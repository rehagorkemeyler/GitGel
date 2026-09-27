import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AUTOCOMPLETE_PER_DAY, DETAILS_PER_DAY, LimitReached, NotConfigured, PER_IP_PER_HOUR, Places, istanbulDay } from '../src/places.ts'

function fakeGoogle() {
  const calls: string[] = []
  const f = (async (url: string | URL) => {
    const u = String(url)
    calls.push(u)
    if (u.includes(':autocomplete')) {
      return new Response(
        JSON.stringify({
          suggestions: [
            { placePrediction: { placeId: 'ChIJmoda0000', structuredFormat: { mainText: { text: 'Moda Sahili' }, secondaryText: { text: 'Kadıköy' } }, types: ['park'], distanceMeters: 6300 } },
          ],
        }),
      )
    }
    return new Response(JSON.stringify({ id: 'ChIJmoda0000', displayName: { text: 'Moda Sahili' }, formattedAddress: 'Caferağa, Kadıköy', location: { latitude: 40.98, longitude: 29.02 } }))
  }) as typeof fetch
  return { f, calls }
}

test('autocomplete stays inside the chosen city', async () => {
  let body = ''
  const f = (async (_u: string | URL, init?: RequestInit) => {
    body = String(init?.body ?? '')
    return new Response(JSON.stringify({ suggestions: [] }))
  }) as typeof fetch
  const p = new Places({ key: 'k', fetch: f })
  await p.autocomplete('kızılay', 'session-1234', undefined, 'ankara')
  assert.equal(JSON.parse(body).locationRestriction.rectangle.low.latitude, 39.5)
})

test('istanbul day switches at 21:00 UTC', () => {
  assert.equal(istanbulDay(Date.parse('2026-09-27T20:59:00Z')), '2026-09-27')
  assert.equal(istanbulDay(Date.parse('2026-09-27T21:00:00Z')), '2026-09-28')
})

test('autocomplete maps suggestions and counts requests', async () => {
  const g = fakeGoogle()
  const p = new Places({ key: 'k', fetch: g.f })
  const r = await p.autocomplete('moda', 'session-1234', [41, 29])
  assert.deepEqual(r, [{ id: 'ChIJmoda0000', name: 'Moda Sahili', sub: 'Kadıköy', types: ['park'], distance: 6300 }])
  assert.equal(p.today().autocomplete, 1)
})

test('daily caps stop requests before they reach Google, and reset the next Istanbul day', async () => {
  const g = fakeGoogle()
  let now = Date.parse('2026-09-27T10:00:00Z')
  const p = new Places({ key: 'k', fetch: g.f, now: () => now })
  for (let i = 0; i < AUTOCOMPLETE_PER_DAY; i++) await p.autocomplete('moda', 'session-1234')
  await assert.rejects(p.autocomplete('moda', 'session-1234'), LimitReached)
  assert.equal(g.calls.length, AUTOCOMPLETE_PER_DAY)
  now = Date.parse('2026-09-27T21:30:00Z')
  await p.autocomplete('moda', 'session-1234')
  assert.equal(p.today().autocomplete, 1)
})

test('details are cached by place id and capped per day', async () => {
  const g = fakeGoogle()
  const p = new Places({ key: 'k', fetch: g.f })
  const a = await p.place('ChIJmoda0000', 'session-1234')
  const b = await p.place('ChIJmoda0000', 'session-5678')
  assert.deepEqual(a, b)
  assert.equal(g.calls.length, 1)
  assert.ok(g.calls[0].includes('sessionToken=session-1234'))
  for (let i = 1; i < DETAILS_PER_DAY; i++) await p.place(`ChIJother${i}xx`, 's-12345678')
  await assert.rejects(p.place('ChIJlast00000', 's-12345678'), LimitReached)
})

test('counters and cache survive a restart', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'places-')), 'places.json')
  const g = fakeGoogle()
  const now = () => Date.parse('2026-09-27T10:00:00Z')
  const p1 = new Places({ key: 'k', fetch: g.f, file, now })
  await p1.autocomplete('moda', 'session-1234')
  await p1.place('ChIJmoda0000', 'session-1234')
  const p2 = new Places({ key: 'k', fetch: g.f, file, now })
  assert.deepEqual(p2.today(), { day: '2026-09-27', autocomplete: 1, details: 1 })
  await p2.place('ChIJmoda0000', 'session-9999')
  assert.equal(g.calls.length, 2)
})

test('per-client hourly limit', () => {
  let now = 0
  const p = new Places({ key: 'k', now: () => now })
  for (let i = 0; i < PER_IP_PER_HOUR; i++) p.allowClient('1.2.3.4')
  assert.throws(() => p.allowClient('1.2.3.4'), LimitReached)
  p.allowClient('5.6.7.8')
  now = 3600_000
  p.allowClient('1.2.3.4')
})

test('without a key nothing is called', async () => {
  const g = fakeGoogle()
  const p = new Places({ key: '', fetch: g.f })
  await assert.rejects(p.autocomplete('moda', 'session-1234'), NotConfigured)
  assert.equal(g.calls.length, 0)
})

test('server answers 429/503 with fallback', async () => {
  const { handle } = await import('../src/server.ts')
  const run = async (path: string) => {
    let code = 0
    let body = ''
    const res = { writeHead: (c: number) => (code = c), end: (b: string) => (body = b) }
    await handle({ url: path, method: 'GET', headers: {}, socket: { remoteAddress: '9.9.9.9' } } as never, res as never)
    return { code, body: JSON.parse(body || 'null') }
  }
  assert.equal((await run('/live/places/autocomplete?q=mo&session=session-1234')).code, 400)
  const r = await run('/live/places/autocomplete?q=moda&session=session-1234')
  assert.equal(r.code, 503)
  assert.deepEqual(r.body, { fallback: true })
})
