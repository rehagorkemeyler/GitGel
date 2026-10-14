import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Cache } from '../src/cache.ts'
import { extractResult, istanbulToIso, parseVehicles } from '../src/iett.ts'
import { RateLimited, Upstream, isRateLimited } from '../src/guard.ts'
import { linesIn, parseStatuses, stripHtml } from '../src/metro.ts'

test('istanbul time to ISO', () => {
  assert.equal(istanbulToIso('2026-09-26 03:52:52'), '2026-09-26T00:52:52.000Z')
})

test('parses SOAP result and drops stale vehicles', () => {
  const inner = JSON.stringify([
    { kapino: 'A1', enlem: '41.1', boylam: '29.0', hatkodu: '15F', guzergahkodu: 'x', yon: 'KADIKÖY', son_konum_zamani: '2026-09-26 03:52:52', yakinDurakKodu: '1' },
    { kapino: 'A2', enlem: '41.2', boylam: '29.1', hatkodu: '15F', guzergahkodu: 'x', yon: 'BEYKOZ', son_konum_zamani: '2026-09-26 01:00:00', yakinDurakKodu: '2' },
  ])
  const xml = `<soap:Body><GetHatOtoKonum_jsonResponse><GetHatOtoKonum_jsonResult>${inner.replace(/"/g, '&quot;')}</GetHatOtoKonum_jsonResult></GetHatOtoKonum_jsonResponse></soap:Body>`
  const now = Date.parse('2026-09-26T00:54:00Z')
  const v = parseVehicles(extractResult(xml, 'GetHatOtoKonum_json'), now)
  assert.deepEqual(v.map((x) => x.id), ['A1'])
  assert.equal(v[0].lat, 41.1)
})

test('status parsing and line detection', () => {
  assert.equal(stripHtml('<p>Sayın&nbsp;Yolcularımız;</p>'), 'Sayın Yolcularımız;')
  assert.equal(stripHtml('Mecidiyek&ouml;y &ccedil;alışma&#39;sı'), "Mecidiyeköy çalışma'sı")
  assert.deepEqual(parseStatuses([{ LineName: 'M7', Description: '<b>Onarım</b>', UpdateDate: 'x', IsActive: true }]), [
    { line: 'M7', message: 'Onarım', updated: 'x' },
  ])
  assert.deepEqual(linesIn("M7 Yıldız–Mahmutbey ve T5 hatlarında"), ['M7', 'T5'])
})

test('cache serves stale value when the source fails', async () => {
  let t = 0
  const c = new Cache<number>(1000, 10_000, 10, () => t)
  assert.deepEqual((await c.get('k', async () => 1)).value, 1)
  t = 2000
  const r = await c.get('k', async () => {
    throw new Error('down')
  })
  assert.equal(r.value, 1)
  assert.equal(r.stale, true)
  t = 20_000
  await assert.rejects(c.get('k', async () => {
    throw new Error('down')
  }))
})

test('cache shares one upstream call', async () => {
  const c = new Cache<number>(1000, 1000)
  let calls = 0
  const load = async () => {
    calls++
    await new Promise((r) => setTimeout(r, 10))
    return 7
  }
  await Promise.all([c.get('a', load), c.get('a', load)])
  assert.equal(calls, 1)
})

test('routes with and without the /live prefix', async () => {
  const { handle } = await import('../src/server.ts')
  for (const u of ['/live/health', '/health']) {
    let code = 0
    const res = { writeHead: (c: number) => { code = c }, end: () => {} }
    await handle({ url: u, method: 'GET' } as never, res as never)
    assert.equal(code, 200)
  }
})

test('rate-limit answers are recognised (İBB gateway fault, 429, plain text)', () => {
  const fault =
    '<soapenv:Fault><faultcode>soapenv:Server</faultcode><faultstring>Policy Falsified</faultstring><detail><l7:policyResult status="Rate limit exceeded."/></detail></soapenv:Fault>'
  assert.equal(isRateLimited(500, fault), true)
  assert.equal(isRateLimited(429, ''), true)
  assert.equal(isRateLimited(503, 'Too Many Requests'), true)
  assert.equal(isRateLimited(200, '<GetHatOtoKonum_jsonResult>[]</GetHatOtoKonum_jsonResult>'), false)
  assert.equal(isRateLimited(500, 'Internal error'), false)
})

test('upstream backs off 2, 4 ... 30 minutes after a rate limit and resets on a good answer', () => {
  const u = new Upstream('X', 100)
  const min = 60_000
  const limit = (now: number) => assert.throws(() => u.answer(500, 'Rate limit exceeded.', now), RateLimited)
  assert.equal(u.blocked(0), false)
  limit(0)
  assert.equal(u.blocked(2 * min - 1), true)
  assert.throws(() => u.take(min), RateLimited)
  assert.equal(u.blocked(2 * min), false)
  limit(2 * min)
  assert.equal(u.blocked(6 * min - 1), true)
  for (let i = 0; i < 10; i++) limit(0)
  assert.equal(u.blocked(30 * min - 1), true)
  assert.equal(u.blocked(30 * min), false)
  u.answer(200, 'ok')
  assert.equal(u.blocked(0), false)
  limit(0)
  assert.equal(u.blocked(2 * min), false)
})

test('upstream never sends more than its budget per minute; the sampler only uses spare budget', () => {
  const u = new Upstream('X', 4)
  u.take(0)
  assert.equal(u.spare(0), true)
  u.take(1)
  assert.equal(u.spare(1), false)
  u.take(2)
  u.take(3)
  assert.throws(() => u.take(4), RateLimited)
  assert.throws(() => u.take(59_999), RateLimited)
  u.take(60_000)
  assert.equal(u.used(60_003), 1)
})
