import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bucketOf, Calibration, Sampler } from '../src/calibration.ts'
import type { Vehicle } from '../src/iett.ts'

const T0 = Date.parse('2026-09-28T05:00:00Z') // Monday 08:00 in Istanbul
const bus = (stop: string, sec: number, pattern = '500T_G_D0'): Vehicle => ({
  id: 'C-1', lat: 41, lon: 29, line: '500T', pattern, headsign: '', nearStop: stop,
  at: new Date(T0 + sec * 1000).toISOString(),
})

test('time-of-day buckets use Istanbul time', () => {
  assert.equal(bucketOf(T0), 'wd-am')
  assert.equal(bucketOf(Date.parse('2026-09-28T10:00:00Z')), 'wd-mid')
  assert.equal(bucketOf(Date.parse('2026-09-28T14:30:00Z')), 'wd-pm')
  assert.equal(bucketOf(Date.parse('2026-09-28T22:00:00Z')), 'wd-night')
  assert.equal(bucketOf(Date.parse('2026-09-26T05:00:00Z')), 'we-am') // Saturday
  assert.equal(bucketOf(Date.parse('2026-09-27T23:30:00Z')), 'we-night') // Monday 02:30 = Sunday night
})

test('records stop-to-stop times, skipping the first partial hop', () => {
  const c = new Calibration()
  const now = T0 + 600_000
  assert.deepEqual(c.observe([bus('A', 0)], now), [])
  assert.deepEqual(c.observe([bus('B', 60)], now), []) // seen mid-way from A: lower bound only
  assert.deepEqual(c.observe([bus('B', 120)], now), [])
  const o = c.observe([bus('C', 150)], now)
  assert.deepEqual(o, [{ line: '500T', from: 'B', to: 'C', bucket: 'wd-am', seconds: 90 }])
  // Turning around resets the track.
  assert.deepEqual(c.observe([bus('D', 200, '500T_D_D0')], now), [])
  assert.deepEqual(c.observe([bus('E', 300, '500T_D_D0')], now), [])
  assert.deepEqual(c.summary(), [{ line: '500T', from: 'B', to: 'C', bucket: 'wd-am', median: 90, n: 1 }])
})

test('calibration survives a restart', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'cal-')), 'cal.json')
  const c = new Calibration()
  c.observe([bus('A', 0)]); c.observe([bus('B', 60)]); c.observe([bus('C', 200)])
  c.save(file)
  const d = new Calibration()
  d.load(file)
  assert.deepEqual(d.summary(), c.summary())
})

test('sampler rotates through all lines in batches', () => {
  const s = new Sampler(2, 1000)
  s.setLines(['1', '2', '3'])
  const seen = new Set([...s.current(0), ...s.current(1000), ...s.current(2000)])
  assert.equal(seen.size, 3)
  assert.deepEqual(s.current(2500), s.current(2999))
})
