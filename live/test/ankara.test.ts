import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ankaraToIso,
  getArrivalsByStop,
  mockArrivals,
  mockVehicles,
  normalizePlate,
  parseArrivals,
  parseFeatures,
  parseVehicles,
} from '../src/providers/ego.ts'

const sample = (f: string) => readFileSync(new URL(`../../docs/api-samples/ankara/${f}`, import.meta.url), 'utf8')
// The samples were saved at 22:05 Ankara time.
const NOW = Date.parse('2026-09-26T19:05:00Z')

async function call(u: string) {
  const { handle } = await import('../src/server.ts')
  let code = 0
  let body = ''
  const res = { writeHead: (c: number) => { code = c }, end: (b: string) => { body = b } }
  await handle({ url: u, method: 'GET' } as never, res as never)
  return { code, json: body ? JSON.parse(body) : null }
}

test('plate normalization', () => {
  assert.equal(normalizePlate('06 HO  1327-'), '06 HO 1327')
  assert.equal(normalizePlate(' 06 gcc 576 '), '06 GCC 576')
  assert.equal(normalizePlate('-'), null)
  assert.equal(normalizePlate(undefined), null)
})

test('features and Ankara time', () => {
  assert.deepEqual(parseFeatures('Körüklü\u201A Engelli'), ['Körüklü', 'Engelli'])
  assert.deepEqual(parseFeatures('-'), [])
  assert.equal(ankaraToIso('26.09.2026 22:04:21'), '2026-09-26T19:04:21.000Z')
  assert.equal(ankaraToIso('bad'), null)
})

test('line sample becomes vehicles, scheduled rows dropped', () => {
  const v = parseVehicles(sample('Otobus_HAT_481.json'), '481', NOW)
  assert.equal(v.length, 3)
  const b = v.find((x) => x.id === '26-412')!
  assert.deepEqual(b, {
    id: '26-412',
    line: '481',
    lat: 40.007271,
    lon: 32.865051,
    speed: 27,
    heading: 137,
    plate: '06 GCC 576',
    features: ['Körüklü', 'Engelli'],
    updatedAt: '2026-09-26T19:04:13.000Z',
  })
})

test('stop sample becomes sorted live arrivals', () => {
  const a = parseArrivals(sample('Otobusler_DURAK_10940.json'), NOW)
  assert.deepEqual(
    a.map((x) => [x.line, x.plate, x.etaSeconds, x.stopsAway]),
    [
      ['263-7', '06 HO 1214', 2119, 36],
      ['263-7', '06 HO 1220', 3180, 56],
    ],
  )
  assert.equal(a[0].lineName, '(ÖHO) ETLİK-AŞAĞI EĞLENCE-BAKANLIK-BALGAT')
  assert.equal(a[0].speed, 49)
})

test('stale fixes, out-of-area coordinates and passed buses are dropped', () => {
  const base = { arac_no: '1-1', plaka_no: '06 A 1', lat: '39.92', lng: '32.85', hat_no: '391', hat_ad: 'X', konum_tarihi: '26.09.2026 22:04:00', saniye: '60', sure: '1 dk', durak_sira_no: '5', secili_durak_sira_no: '9' }
  const doc = (...t: object[]) => JSON.stringify({ status: 'TRUE', table: t })
  const stale = { ...base, arac_no: '2', konum_tarihi: '26.09.2026 21:50:00' }
  const away = { ...base, arac_no: '3', lat: '41.0', lng: '29.0' }
  const passed = { ...base, arac_no: '4', saniye: '999999', sure: 'Geçti' }
  const behind = { ...base, arac_no: '5', durak_sira_no: '12' }
  assert.deepEqual(parseVehicles(doc(base, stale, away), '391', NOW).map((x) => x.id), ['1-1'])
  assert.deepEqual(parseArrivals(doc(base, stale, away, passed, behind), NOW).map((x) => x.etaSeconds), [60])
  assert.throws(() => parseArrivals(JSON.stringify({ status: 'FALSE', message: 'hata' }), NOW))
})

test('provider calls EGO with a timeout and parses the answer', async () => {
  delete process.env.EGO_MOCK
  const real = globalThis.fetch
  let asked = ''
  globalThis.fetch = (async (u: string, init: RequestInit) => {
    asked = u
    assert.ok(init.signal)
    return new Response(sample('Otobusler_DURAK_10940.json'))
  }) as typeof fetch
  try {
    const a = await getArrivalsByStop('10940', NOW)
    assert.match(asked, /FNC=Otobusler/)
    assert.match(asked, /DURAK=10940/)
    assert.equal(a.length, 2)
    globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    await assert.rejects(getArrivalsByStop('10940', NOW))
  } finally {
    globalThis.fetch = real
  }
})

test('mock vehicles follow the contract', () => {
  const v = mockVehicles('185-7', Date.parse('2026-09-26T18:00:00Z'))
  assert.equal(v.length, 3)
  for (const x of v) {
    assert.equal(x.line, '185-7')
    assert.ok(x.lat > 39.8 && x.lat < 40.1 && x.lon > 32.7 && x.lon < 33.0)
    assert.ok(!Number.isNaN(Date.parse(x.updatedAt)))
  }
})

test('mock arrivals are sorted and non-negative', () => {
  const a = mockArrivals('11654', Date.parse('2026-09-26T18:00:00Z'))
  assert.ok(a.length > 0)
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].etaSeconds <= a[i].etaSeconds)
  assert.ok(a.every((x) => x.etaSeconds >= 0))
})

test('ankara routes validate input', async () => {
  delete process.env.EGO_MOCK
  assert.equal((await call('/live/ankara/arrivals?stop=abc')).code, 400)
  assert.equal((await call('/live/ankara/vehicles?line=%3Cx%3E')).code, 400)
})

test('ankara routes serve mock data', async () => {
  process.env.EGO_MOCK = '1'
  const v = await call('/live/ankara/vehicles?line=391')
  assert.equal(v.code, 200)
  assert.equal(v.json.vehicles.length, 3)
  const a = await call('/live/ankara/arrivals?stop=11654')
  assert.equal(a.code, 200)
  assert.ok(Array.isArray(a.json.arrivals))
  delete process.env.EGO_MOCK
})
