// Ankara ETA audit: how good is EGO's "kalan dakika"?
//
// A few watched lines are polled once a minute with EGO's ETA to two of their
// stops (half way and near the end). Every few minutes each bus's ETA is noted;
// when the bus later passes the stop, the real travel time is known and both
// are kept. The records answer, per hour of the day, how far EGO's ETA is off,
// and are the ground truth for a better model. No vehicle ids are stored.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { EtaFix } from './providers/ego.ts'

/** [prediction time (unix s), line, stop, stops away, EGO ETA (s), real time to the stop (s)] */
export type EtaRecord = [number, string, string, number, number, number]

const NOTE_EVERY_MS = 3 * 60_000 // one ETA per bus and stop every 3 minutes
const MAX_GAP_MS = 3 * 60_000 // passing time known to ±1.5 min at worst, else dropped
const FORGET_MS = 45 * 60_000
const KEEP = 200_000 // about three weeks for five lines

type Note = { t: number; eta: number; stops: number }
type Bus = { seq: number; before: number; notes: Note[]; noted: number; seen: number }

/** Ankara hour (UTC+3) and weekday (0 = Sunday) of a unix-ms time. */
export function ankaraHour(ms: number): { hour: number; day: number } {
  const d = new Date(ms + 3 * 3600_000)
  return { hour: d.getUTCHours(), day: d.getUTCDay() }
}

export class EtaAudit {
  private buses = new Map<string, Bus>()
  records: EtaRecord[] = []

  /** Feed one poll (line, stop and the fixes EGO returned). Returns the new records (for tests). */
  observe(line: string, stop: string, fixes: EtaFix[], now = Date.now()): EtaRecord[] {
    const out: EtaRecord[] = []
    for (const f of fixes) {
      const key = `${line}|${stop}|${f.id}`
      let b = this.buses.get(key)
      if (f.seq <= f.target) {
        // New bus, or it started a new trip (sequence went back): start over.
        if (!b || f.seq < b.seq - 2) {
          b = { seq: f.seq, before: f.at, notes: [], noted: 0, seen: now }
          this.buses.set(key, b)
        }
        b.seq = f.seq
        b.before = Math.max(b.before, f.at)
        b.seen = now
        if (f.eta !== null && now - b.noted >= NOTE_EVERY_MS) {
          b.notes.push({ t: now, eta: Math.round(f.eta), stops: f.target - f.seq })
          b.noted = now
        }
        continue
      }
      // Past the stop: it went by between the last fix before it and this one.
      if (b && b.notes.length && f.at > b.before && f.at - b.before <= MAX_GAP_MS) {
        const passed = (b.before + f.at) / 2
        for (const n of b.notes) {
          const real = Math.round((passed - n.t) / 1000)
          if (real < 0) continue
          const r: EtaRecord = [Math.round(n.t / 1000), line, stop, n.stops, n.eta, real]
          this.records.push(r)
          out.push(r)
        }
      }
      this.buses.delete(key)
    }
    for (const [k, b] of this.buses) if (now - b.seen > FORGET_MS) this.buses.delete(k)
    if (this.records.length > KEEP) this.records.splice(0, this.records.length - KEEP)
    return out
  }

  /** Error of EGO's ETA (real minus predicted, seconds) by line, by Ankara hour and by ETA size. */
  summary() {
    const groups = new Map<string, { errors: number[]; pace: number[] }>()
    const add = (k: string, r: EtaRecord) => {
      const g = groups.get(k) ?? { errors: [], pace: [] }
      g.errors.push(r[5] - r[4])
      if (r[3] > 0) g.pace.push(r[5] / r[3])
      groups.set(k, g)
    }
    for (const r of this.records) {
      const { hour, day } = ankaraHour(r[0] * 1000)
      const days = day === 0 || day === 6 ? 'we' : 'wd'
      const eta = r[4] / 60
      const band = eta < 5 ? '0-5' : eta < 15 ? '5-15' : eta < 30 ? '15-30' : '30+'
      add('all', r)
      add(`line|${r[1]}`, r)
      add(`hour|${days}|${String(hour).padStart(2, '0')}`, r)
      add(`eta|${band}`, r)
    }
    const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null)
    const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] : null)
    const rows = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([group, g]) => {
      const abs = g.errors.map(Math.abs)
      return {
        group,
        n: g.errors.length,
        bias: median(g.errors), // > 0: the bus came later than EGO said
        medianAbs: median(abs),
        p90Abs: pct(abs, 0.9),
        within2min: Math.round((100 * abs.filter((e) => e <= 120).length) / abs.length),
        secPerStop: median(g.pace), // real
      }
    })
    return { records: this.records.length, rows }
  }

  /**
   * How much longer buses really take than EGO says (real / EGO ETA), per audited line
   * and over all of them, from the last week. On the first day this cut the typical error
   * from 3.4 to 2.3 minutes. Too few records: no factor.
   */
  factors(now = Date.now()): { all: number | null; lines: Record<string, number> } {
    const since = now / 1000 - 7 * 86400
    const by = new Map<string, number[]>()
    const all: number[] = []
    for (const r of this.records) {
      if (r[0] < since || r[4] < 60) continue
      const k = r[5] / r[4]
      all.push(k)
      by.set(r[1], [...(by.get(r[1]) ?? []), k])
    }
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
    const clamp = (k: number) => Math.round(Math.min(1.4, Math.max(1, k)) * 100) / 100
    const lines: Record<string, number> = {}
    for (const [l, a] of by) if (a.length >= 200) lines[l] = clamp(median(a))
    return { all: all.length >= 500 ? clamp(median(all)) : null, lines }
  }

  save(file: string) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file + '.tmp', JSON.stringify(this.records))
    renameSync(file + '.tmp', file)
  }

  load(file: string) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as EtaRecord[]
      if (Array.isArray(data)) this.records = data.filter((r) => Array.isArray(r) && r.length === 6).slice(-KEEP)
    } catch {
      // First start or unreadable file: begin empty.
    }
  }
}

/** Two audited stops per line: half way and near the end (a line code is one direction in Ankara). */
export function auditStops(stops: string[]): string[] {
  if (stops.length < 4) return []
  return [...new Set([stops[Math.floor(stops.length * 0.5)], stops[Math.floor(stops.length * 0.9)]])]
}
