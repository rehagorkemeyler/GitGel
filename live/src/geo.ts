
import { createWriteStream, existsSync, readFileSync, renameSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { isIP } from 'node:net'

export type Geo = { country?: string; region?: string; city?: string }

const MARKER = Buffer.from([0xab, 0xcd, 0xef, ...Buffer.from('MaxMind.com')])

export class MmdbReader {
  private nodeCount: number
  private recordSize: number
  private ipVersion: number
  private dataStart: number
  private v4Start = 0
  private buf: Buffer

  constructor(buf: Buffer) {
    this.buf = buf
    const at = buf.lastIndexOf(MARKER)
    if (at < 0) throw new Error('not a MaxMind DB file')
    const meta = this.decode(at + MARKER.length, at + MARKER.length)[0] as Record<string, number>
    this.nodeCount = meta.node_count
    this.recordSize = meta.record_size
    this.ipVersion = meta.ip_version
    this.dataStart = (this.recordSize / 4) * this.nodeCount + 16
    if (this.ipVersion === 6) {
      let node = 0
      for (let i = 0; i < 96 && node < this.nodeCount; i++) node = this.record(node, 0)
      this.v4Start = node
    }
  }

  lookup(ip: string): unknown {
    const v = isIP(ip)
    if (!v) return undefined
    const bytes = v === 4 ? ip.split('.').map(Number) : ipv6Bytes(ip)
    if (v === 6 && this.ipVersion === 4) return undefined
    let node = v === 4 ? this.v4Start : 0
    for (let i = 0; i < bytes.length * 8 && node < this.nodeCount; i++) {
      node = this.record(node, (bytes[i >> 3] >> (7 - (i & 7))) & 1)
    }
    if (node <= this.nodeCount) return undefined
    const off = this.dataStart + (node - this.nodeCount - 16)
    return this.decode(off, this.dataStart)[0]
  }

  private record(node: number, bit: number): number {
    const b = this.buf
    const size = this.recordSize
    const o = node * (size / 4)
    if (size === 24) return b.readUIntBE(o + bit * 3, 3)
    if (size === 32) return b.readUInt32BE(o + bit * 4)
    return bit === 0 ? ((b[o + 3] & 0xf0) << 20) | b.readUIntBE(o, 3) : ((b[o + 3] & 0x0f) << 24) | b.readUIntBE(o + 4, 3)
  }

  private decode(off: number, base: number): [unknown, number] {
    const b = this.buf
    const ctrl = b[off++]
    let type = ctrl >> 5
    if (type === 1) {
      const ss = (ctrl >> 3) & 3
      const vvv = ctrl & 7
      let p: number
      if (ss === 0) p = (vvv << 8) | b[off]
      else if (ss === 1) p = ((vvv << 16) | b.readUInt16BE(off)) + 2048
      else if (ss === 2) p = ((vvv << 24) | b.readUIntBE(off, 3)) + 526336
      else p = b.readUInt32BE(off)
      return [this.decode(base + p, base)[0], off + ss + 1]
    }
    if (type === 0) type = 7 + b[off++]
    let size = ctrl & 0x1f
    if (size === 29) size = 29 + b[off++]
    else if (size === 30) (size = 285 + b.readUInt16BE(off)), (off += 2)
    else if (size === 31) (size = 65821 + b.readUIntBE(off, 3)), (off += 3)
    switch (type) {
      case 2:
        return [b.toString('utf8', off, off + size), off + size]
      case 3:
        return [b.readDoubleBE(off), off + 8]
      case 4:
        return [b.subarray(off, off + size), off + size]
      case 5:
      case 6:
      case 9:
      case 10: {
        let n = 0
        for (let i = 0; i < size; i++) n = n * 256 + b[off + i]
        return [n, off + size]
      }
      case 7: {
        const m: Record<string, unknown> = {}
        for (let i = 0; i < size; i++) {
          const [k, o1] = this.decode(off, base)
          const [v, o2] = this.decode(o1, base)
          m[k as string] = v
          off = o2
        }
        return [m, off]
      }
      case 8:
        return [size ? b.readIntBE(off, size) : 0, off + size]
      case 11: {
        const a: unknown[] = []
        for (let i = 0; i < size; i++) {
          const [v, o] = this.decode(off, base)
          a.push(v)
          off = o
        }
        return [a, off]
      }
      case 14:
        return [size !== 0, off]
      case 15:
        return [b.readFloatBE(off), off + 4]
      default:
        return [undefined, off + size]
    }
  }
}

export function ipv6Bytes(ip: string): number[] {
  const [head, tail = ''] = ip.split('::')
  const part = (s: string) => (s ? s.split(':') : [])
  let h = part(head)
  let t = part(tail)
  const last = (ip.includes('::') ? t : h).at(-1) ?? ''
  if (last.includes('.')) {
    const q = last.split('.').map(Number)
    const words = [((q[0] << 8) | q[1]).toString(16), ((q[2] << 8) | q[3]).toString(16)]
    if (ip.includes('::')) t = [...t.slice(0, -1), ...words]
    else h = [...h.slice(0, -1), ...words]
  }
  const groups = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t]
  return groups.flatMap((g) => {
    const n = parseInt(g || '0', 16)
    return [n >> 8, n & 255]
  })
}

type DbIpRecord = {
  city?: { names?: Record<string, string> }
  country?: { iso_code?: string }
  subdivisions?: { names?: Record<string, string> }[]
}

export class GeoIp {
  private reader: MmdbReader | null = null
  private file: string

  constructor(file: string) {
    this.file = file
  }

  lookup(ip: string): Geo {
    const plain = ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip
    try {
      const r = this.reader?.lookup(plain) as DbIpRecord | undefined
      if (!r) return {}
      return { country: r.country?.iso_code, region: r.subdivisions?.[0]?.names?.en, city: r.city?.names?.en }
    } catch {
      return {}
    }
  }

  load(): boolean {
    try {
      if (existsSync(this.file)) this.reader = new MmdbReader(readFileSync(this.file))
    } catch (e) {
      console.error('geo database unreadable', e)
    }
    return !!this.reader
  }

  async refresh(now = new Date()): Promise<void> {
    if (existsSync(this.file) && now.getTime() - statSync(this.file).mtimeMs < 35 * 86400_000) {
      if (!this.reader) this.load()
      return
    }
    for (const back of [0, 1]) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
      const month = d.toISOString().slice(0, 7)
      const url = `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) })
        if (!r.ok || !r.body) continue
        const tmp = `${this.file}.tmp`
        await pipeline(Readable.fromWeb(r.body as never), createGunzip(), createWriteStream(tmp))
        new MmdbReader(readFileSync(tmp))
        renameSync(tmp, this.file)
        this.load()
        console.log(`geo database ${month} loaded`)
        return
      } catch (e) {
        console.error(`geo database ${month} failed: ${(e as Error).message}`)
      }
    }
  }
}
