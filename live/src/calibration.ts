// Bus timetable calibration from GPS. İETT publishes only the first-stop time
// of each trip, so the ETL estimates the rest with a speed model. This module
// watches real buses and records how long they take between the stops they
// pass, so the nightly ETL can scale that model per line and time of day.
//
// It samples a few lines at a time (rotating through all bus lines) and also
// learns from every line the app asks for. Only stop codes, line codes and
// durations are stored: no vehicle ids leave this process.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Vehicle } from './iett.ts'

export type Bucket = `${'wd' | 'we'}-${'am' | 'mid' | 'pm' | 'night'}`

/**
 * Istanbul time (UTC+3, no DST): weekday or weekend, then morning peak,
 * midday, evening peak or the rest. Early hours count as the previous day,
 * matching GTFS service days.
 */
export function bucketOf(ms: number): Bucket {
  const local = new Date(ms + 3 * 3600_000)
  const h = local.getUTCHours()
  const day = new Date(ms + 3 * 3600_000 - (h < 4 ? 86400_000 : 0)).getUTCDay()
  const dayType = day === 0 || day === 6 ? 'we' : 'wd'
  const part = h >= 6 && h < 10 ? 'am' : h >= 10 && h < 16 ? 'mid' : h >= 16 && h < 20 ? 'pm' : 'night'
  return `${dayType}-${part}`
}

/** Travel time between two consecutive distinct "nearest stops" of one bus. */
export type Observation = { line: string; from: string; to: string; bucket: Bucket; seconds: number }

const MIN_S = 20
const MAX_S = 30 * 60
const KEEP = 30 // most recent samples per stop pair and bucket
const FORGET_MS = 45 * 60_000 // vehicle state older than this is dropped

// exact: "since" is when the bus reached this stop's area, not merely when we first saw it.
type Track = { pattern: string; stop: string; since: number; seen: number; exact: boolean }

export class Calibration {
  private tracks = new Map<string, Track>()
  private samples = new Map<string, number[]>()

  /** Feed one poll of a line. Returns the new observations (for tests). */
  observe(vehicles: Vehicle[], now = Date.now()): Observation[] {
    const out: Observation[] = []
    for (const v of vehicles) {
      if (!v.nearStop || !v.pattern) continue
      const at = Date.parse(v.at)
      const key = `${v.line}|${v.id}`
      const t = this.tracks.get(key)
      if (!t || t.pattern !== v.pattern || at < t.seen) {
        // New bus or it turned around: start over.
        this.tracks.set(key, { pattern: v.pattern, stop: v.nearStop, since: at, seen: at, exact: false })
        continue
      }
      t.seen = at
      if (v.nearStop === t.stop) continue
      const seconds = (at - t.since) / 1000
      // A bus first seen mid-way between stops gives only a lower bound: skip it.
      if (t.exact && seconds >= MIN_S && seconds <= MAX_S) {
        const o: Observation = { line: v.line, from: t.stop, to: v.nearStop, bucket: bucketOf(t.since), seconds }
        this.add(o)
        out.push(o)
      }
      t.stop = v.nearStop
      t.since = at
      t.exact = true
    }
    for (const [k, t] of this.tracks) if (now - t.seen > FORGET_MS) this.tracks.delete(k)
    return out
  }

  private add(o: Observation) {
    const k = `${o.line}|${o.from}|${o.to}|${o.bucket}`
    const s = this.samples.get(k) ?? []
    s.push(Math.round(o.seconds))
    if (s.length > KEEP) s.splice(0, s.length - KEEP)
    this.samples.set(k, s)
  }

  /** Aggregated: one row per line, stop pair and bucket, with the median and sample count. */
  summary(): { line: string; from: string; to: string; bucket: string; median: number; n: number }[] {
    const rows = []
    for (const [k, s] of this.samples) {
      const [line, from, to, bucket] = k.split('|')
      const sorted = [...s].sort((a, b) => a - b)
      rows.push({ line, from, to, bucket, median: sorted[Math.floor(sorted.length / 2)], n: s.length })
    }
    return rows
  }

  save(file: string) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file + '.tmp', JSON.stringify(Object.fromEntries(this.samples)))
    renameSync(file + '.tmp', file)
  }

  load(file: string) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, number[]>
      for (const [k, v] of Object.entries(data)) if (Array.isArray(v)) this.samples.set(k, v.slice(-KEEP))
    } catch {
      // First start or unreadable file: begin empty.
    }
  }
}

/**
 * Rotates through bus lines: a small batch is polled every minute for a while,
 * then the next batch. About one request every 5 seconds to İETT in total.
 */
export class Sampler {
  private lines: string[] = []
  private batch: string[] = []
  private next = 0
  private batchStarted = 0
  private readonly batchSize: number
  private readonly batchMs: number

  constructor(batchSize = 12, batchMs = 40 * 60_000) {
    this.batchSize = batchSize
    this.batchMs = batchMs
  }

  setLines(lines: string[]) {
    // Shuffle so each day the batches meet lines at different hours.
    this.lines = [...new Set(lines)].sort(() => Math.random() - 0.5)
    this.next = 0
    this.batch = []
  }

  /** The lines to poll this minute. */
  current(now = Date.now()): string[] {
    if (!this.lines.length) return []
    if (!this.batch.length || now - this.batchStarted >= this.batchMs) {
      this.batch = []
      for (let i = 0; i < Math.min(this.batchSize, this.lines.length); i++) {
        this.batch.push(this.lines[this.next])
        this.next = (this.next + 1) % this.lines.length
      }
      this.batchStarted = now
    }
    return this.batch
  }
}
