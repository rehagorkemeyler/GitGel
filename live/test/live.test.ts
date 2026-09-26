import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Cache } from '../src/cache.ts'
import { extractResult, istanbulToIso, parseVehicles } from '../src/iett.ts'
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
