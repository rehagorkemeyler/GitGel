import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVehiclesByLine, mockArrivals, mockVehicles, NotImplemented } from '../src/providers/ego.ts'

async function call(u: string) {
  const { handle } = await import('../src/server.ts')
  let code = 0
  let body = ''
  const res = { writeHead: (c: number) => { code = c }, end: (b: string) => { body = b } }
  await handle({ url: u, method: 'GET' } as never, res as never)
  return { code, json: body ? JSON.parse(body) : null }
}

test('provider throws NotImplemented without a source', async () => {
  delete process.env.EGO_MOCK
  await assert.rejects(getVehiclesByLine('185-7'), NotImplemented)
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

test('ankara routes validate input and report 501 without a source', async () => {
  delete process.env.EGO_MOCK
  assert.equal((await call('/live/ankara/arrivals?stop=abc')).code, 400)
  assert.equal((await call('/live/ankara/vehicles?line=%3Cx%3E')).code, 400)
  assert.equal((await call('/live/ankara/arrivals?stop=11653')).code, 501)
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
