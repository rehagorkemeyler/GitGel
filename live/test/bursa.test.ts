import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  getBursaStopBoard,
  getBursaVehicles,
  hmsToSeconds,
  inBursa,
  mockBursaBoard,
  mockBursaVehicles,
  otherLines,
  parseBursaArrivals,
  parseBursaVehicles,
  parseStopLines,
} from '../src/providers/burulas.ts'

const sample = (f: string) => readFileSync(new URL(`../../docs/api-samples/bursa/${f}`, import.meta.url), 'utf8')
const NOW = Date.parse('2026-09-30T09:20:00Z')

async function call(u: string) {
  const { handle } = await import('../src/server.ts')
  let code = 0
  let body = ''
  const res = { writeHead: (c: number) => { code = c }, end: (b: string) => { body = b } }
  await handle({ url: u, method: 'GET' } as never, res as never)
  return { code, json: body ? JSON.parse(body) : null }
}

/** Replace fetch for one test; answers by endpoint name, records what was sent. */
function stubFetch(answers: Record<string, string>) {
  const real = globalThis.fetch
  const sent: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    const key = Object.keys(answers).find((k) => url.endsWith('/' + k))
    return new Response(key ? answers[key] : 'Access denied: invalid origin', { status: key ? 200 : 403 })
  }) as typeof fetch
  return { sent, restore: () => { globalThis.fetch = real } }
}

test('vehicles: position, plate, speed, direction, features and boardings', () => {
  const v = parseBursaVehicles(sample('realtimedata_38.json'), '38', NOW)
  assert.equal(v.length, 5)
  assert.deepEqual(v[1], {
    id: '919',
    line: '38',
    lat: 40.262835,
    lon: 29.05890333,
    speed: 27,
    plate: '16 BJZ 19',
    direction: 'G',
    features: [],
    tripBoardings: 16,
    stopBoardings: 16,
    updatedAt: new Date(NOW).toISOString(),
  })
})

test('vehicles: the driver name and daily count never leave the parser', () => {
  const raw = sample('realtimedata_38.json').replaceAll('AD SOYAD', 'MEHMET GİZLİADSOY')
  const out = JSON.stringify(parseBursaVehicles(raw, '38', NOW))
  assert.ok(!out.includes('GİZLİADSOY'))
  assert.ok(!out.includes('surucu'))
  assert.ok(!out.includes('gunlukYolcu'))
  for (const v of parseBursaVehicles(raw, '38', NOW)) assert.deepEqual(Object.keys(v).sort(), [
    'direction', 'features', 'id', 'lat', 'line', 'lon', 'plate', 'speed', 'stopBoardings', 'tripBoardings', 'updatedAt',
  ])
})

test('vehicles: trams are in the same answer', () => {
  const v = parseBursaVehicles(sample('realtimedata_T1.json'), 'T1', NOW)
  assert.ok(v.length > 0)
  assert.ok(v.every((x) => x.line === 'T1' && x.plate?.startsWith('T1-')))
})

test('vehicles: bad fixes, placeholders and duplicates are dropped', () => {
  const row = (o: Record<string, unknown>) => ({ plaka: '16 A 1', hatkodu: '1', validatorNo: 1, enlem: 40.2, boylam: 29.0, ...o })
  const doc = JSON.stringify({ statusCode: 200, result: [
    row({ validatorNo: 1 }),
    row({ validatorNo: 1 }), // duplicate
    row({ validatorNo: 2, enlem: 40, boylam: 29 }), // placeholder
    row({ validatorNo: 3, enlem: 41.0, boylam: 29.0 }), // Istanbul
    row({ validatorNo: 4, enlem: null }),
    row({ validatorNo: 0, plaka: '', enlem: 40.21 }), // no id at all
    row({ validatorNo: '', plaka: '16 b 2', enlem: 40.22, klimaVarMi: 1, engelliUygunMu: 1, istikamet: 'd' }),
  ] })
  const v = parseBursaVehicles(doc, '1', NOW)
  assert.deepEqual(v.map((x) => x.id), ['1', '16 B 2'])
  assert.deepEqual(v[1].features, ['Klima', 'Engelli'])
  assert.equal(v[1].direction, 'D')
  assert.equal(inBursa(40, 29), false)
})

test('an error answer throws', () => {
  assert.throws(() => parseBursaVehicles('{"statusCode":500,"message":"Hata","result":null}', '38', NOW), /Hata/)
  assert.throws(() => parseBursaArrivals('Access denied: invalid origin'))
})

test('stop board: remaining time in seconds, sorted, features, no fake speed', () => {
  assert.equal(hmsToSeconds('00:05:00'), 300)
  assert.equal(hmsToSeconds('01:02:03'), 3723)
  assert.equal(hmsToSeconds('5 dk'), null)
  const a = parseBursaArrivals(sample('stationremainingtime_565.json'))
  assert.equal(a.length, 10)
  assert.deepEqual(a[0], {
    line: '25',
    lineName: 'Pınar Mah. - Çekirge D.Hst.',
    plate: '16 M 0212',
    features: ['Klima', 'Engelli'],
    speed: null,
    etaSeconds: 0,
    stopsAway: null,
  })
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].etaSeconds <= a[i].etaSeconds)
})

test('stop board: other lines are the stop lines with no live bus coming', () => {
  const lines = parseStopLines(sample('RouteByStop_4702.json'))
  assert.deepEqual(lines.map((l) => l.line), ['B17A', 'B25', '97A'])
  const other = otherLines(lines, parseBursaArrivals(sample('stationremainingtime_4702.json')))
  assert.deepEqual(other, [
    { line: 'B17A', lineName: '', nextStart: null, nextStartInMin: null, noMoreToday: false },
    { line: 'B25', lineName: '', nextStart: null, nextStartInMin: null, noMoreToday: false },
  ])
})

test('requests carry the BursaKart origin and the right body types', async () => {
  const f = stubFetch({
    realtimedata: sample('realtimedata_38.json'),
    stationremainingtime: sample('stationremainingtime_4702.json'),
    RouteByStop: sample('RouteByStop_4702.json'),
  })
  try {
    assert.equal((await getBursaVehicles('38', NOW)).length, 5)
    const board = await getBursaStopBoard(4702, NOW)
    assert.equal(board.arrivals.length, 1)
    assert.equal(board.lines.length, 2)
    for (const s of f.sent) {
      assert.equal(s.init.method, 'POST')
      assert.equal((s.init.headers as Record<string, string>).Origin, 'https://www.bursakart.com.tr')
    }
    const bodies = f.sent.map((s) => JSON.parse(String(s.init.body)))
    assert.deepEqual(bodies[0], { keyword: '38' }) // line code: string
    assert.deepEqual(bodies[1], { keyword: 4702 }) // stop id: number, a string gives HTTP 400
  } finally {
    f.restore()
  }
})

test('stop board still works when the stop lines call fails', async () => {
  const f = stubFetch({ stationremainingtime: sample('stationremainingtime_565.json') })
  try {
    const board = await getBursaStopBoard(565, NOW)
    assert.equal(board.arrivals.length, 10)
    assert.deepEqual(board.lines, [])
  } finally {
    f.restore()
  }
})

test('mock data looks like the real thing', () => {
  const v = mockBursaVehicles('38', NOW)
  assert.equal(v.length, 3)
  assert.ok(v.every((x) => inBursa(x.lat, x.lon) && x.tripBoardings !== null))
  const b = mockBursaBoard(4702, NOW)
  for (let i = 1; i < b.arrivals.length; i++) assert.ok(b.arrivals[i - 1].etaSeconds <= b.arrivals[i].etaSeconds)
})

test('bursa routes validate input', async () => {
  delete process.env.BURULAS_MOCK
  assert.equal((await call('/live/bursa/arrivals?stop=abc')).code, 400)
  assert.equal((await call('/live/bursa/arrivals?stop=1234567')).code, 400)
  assert.equal((await call('/live/bursa/vehicles?line=%3Cx%3E')).code, 400)
})

test('bursa routes serve mock data', async () => {
  process.env.BURULAS_MOCK = '1'
  try {
    const v = await call('/live/bursa/vehicles?line=19%C4%B0') // "19İ"
    assert.equal(v.code, 200)
    assert.equal(v.json.line, '19İ')
    assert.equal(v.json.vehicles.length, 3)
    const a = await call('/live/bursa/arrivals?stop=4702')
    assert.equal(a.code, 200)
    assert.ok(Array.isArray(a.json.arrivals))
    assert.ok(Array.isArray(a.json.lines))
  } finally {
    delete process.env.BURULAS_MOCK
  }
})
