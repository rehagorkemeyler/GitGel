import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ankaraHour, auditStops, EtaAudit } from '../src/etaAudit.ts'
import { parseEtaFixes, parseLineStops } from '../src/providers/ego.ts'

const sample = (f: string) => readFileSync(new URL(`../../docs/api-samples/ankara/${f}`, import.meta.url), 'utf8')
const T0 = Date.parse('2026-10-27T05:00:00Z') // Tuesday 08:00 in Ankara
const fix = (seq: number, sec: number, eta: number | null, id = '12-423') => ({ id, seq, target: 10, eta, at: T0 + sec * 1000 })

test('EGO sample becomes ETA fixes; passed buses have no ETA', () => {
  const f = parseEtaFixes(sample('Otobus_HAT_481_DURAK_10940.json'), Date.parse('2026-09-26T19:05:00Z'))
  assert.deepEqual(
    f.map((x) => [x.id, x.seq, x.target, x.eta]),
    [['12-423', 34, 57, 1036], ['26-412', 7, 57, 3141], [f[2].id, 78, 57, null]],
  )
})

test('line stops in order, audited half way and near the end', () => {
  assert.deepEqual(parseLineStops(JSON.stringify({ table_durak: [{ sira: '2', kod: 'B' }, { sira: '1', kod: 'A' }] })), ['A', 'B'])
  assert.deepEqual(auditStops(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']), ['f', 'j'])
  assert.deepEqual(auditStops(['a', 'b']), [])
})

test('ETA notes every 3 minutes are scored when the bus passes the stop', () => {
  const a = new EtaAudit()
  assert.deepEqual(a.observe('481', 'S', [fix(4, 0, 600)], T0), [])
  assert.deepEqual(a.observe('481', 'S', [fix(5, 60, 540)], T0 + 60_000), []) // too soon for a second note
  assert.deepEqual(a.observe('481', 'S', [fix(8, 180, 300)], T0 + 180_000), [])
  assert.deepEqual(a.observe('481', 'S', [fix(10, 660, 0)], T0 + 660_000), [])
  // Passed between 660 s and 720 s: 690 s after the first note, 510 s after the second.
  const r = a.observe('481', 'S', [fix(11, 720, null)], T0 + 720_000)
  assert.deepEqual(r, [
    [T0 / 1000, '481', 'S', 6, 600, 690],
    [T0 / 1000 + 180, '481', 'S', 2, 300, 510],
    [T0 / 1000 + 660, '481', 'S', 0, 0, 30],
  ])
  const s = a.summary()
  assert.equal(s.records, 3)
  assert.deepEqual(s.rows.find((x) => x.group === 'hour|wd|08'), {
    group: 'hour|wd|08', n: 3, bias: 90, medianAbs: 90, p90Abs: 90, within2min: 67, secPerStop: 255,
  })
})

test('a long gap or a new trip drops the notes', () => {
  const a = new EtaAudit()
  a.observe('481', 'S', [fix(8, 0, 120)], T0)
  assert.deepEqual(a.observe('481', 'S', [fix(12, 600, null)], T0 + 600_000), []) // 10 min without a fix
  a.observe('481', 'S', [fix(8, 0, 120)], T0)
  a.observe('481', 'S', [fix(1, 60, 900)], T0 + 60_000) // new trip: only its own note counts
  assert.deepEqual(a.observe('481', 'S', [fix(11, 120, null)], T0 + 120_000), [[T0 / 1000 + 60, '481', 'S', 9, 900, 30]])
})

test('ETA audit survives a restart and uses Ankara time', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'eta-')), 'eta.json')
  const a = new EtaAudit()
  a.records.push([T0 / 1000, '340', 'S', 3, 180, 200])
  a.save(file)
  const b = new EtaAudit()
  b.load(file)
  assert.deepEqual(b.records, a.records)
  assert.deepEqual(ankaraHour(T0), { hour: 8, day: 2 })
})

test('correction factors need enough records and stay between 1 and 1.4', () => {
  const a = new EtaAudit()
  const now = T0 + 3600_000
  for (let i = 0; i < 300; i++) a.records.push([T0 / 1000, '340', 'S', 5, 600, 720])
  for (let i = 0; i < 300; i++) a.records.push([T0 / 1000, '183-1', 'S', 5, 600, 1200])
  for (let i = 0; i < 50; i++) a.records.push([T0 / 1000, '185-7', 'S', 5, 600, 600])
  a.records.push([T0 / 1000 - 8 * 86400, '340', 'S', 5, 600, 6000]) // older than a week
  assert.deepEqual(a.factors(now), { all: 1.2, lines: { '340': 1.2, '183-1': 1.4 } })
  assert.deepEqual(new EtaAudit().factors(now), { all: null, lines: {} })
})
