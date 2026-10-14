// Keeps us under each upstream's rate limit. The İBB gateway banned our server IP for İETT after
// one request every 5 s around the clock (HTTP 500, "Rate limit exceeded"), which cut live buses off
// for everyone. Every live source (İETT, EGO, BURULAŞ) goes through one of these:
//  - a hard budget of requests per minute, whatever users or the calibration sampler ask for
//    (over budget, the call fails at once and the cache serves the last good answer);
//  - after a rate-limit answer, no requests at all for 2 minutes, doubling up to 30, until a good answer.

export class RateLimited extends Error {}

/** True for the answers sources give when we ask too often (İBB gateway fault, HTTP 429, plain text). */
export function isRateLimited(status: number, body: string): boolean {
  return status === 429 || /Rate limit exceeded|Policy Falsified|Too many requests/i.test(body)
}

export class Upstream {
  readonly name: string
  private readonly perMinute: number
  private readonly minMs: number
  private readonly maxMs: number
  private sent: number[] = []
  private until = 0
  private backoffMs = 0

  constructor(name: string, perMinute: number, minMs = 2 * 60_000, maxMs = 30 * 60_000) {
    this.name = name
    this.perMinute = perMinute
    this.minMs = minMs
    this.maxMs = maxMs
  }

  /** Requests sent in the last minute. */
  used(now = Date.now()): number {
    while (this.sent.length && now - this.sent[0] >= 60_000) this.sent.shift()
    return this.sent.length
  }

  blocked(now = Date.now()): boolean {
    return now < this.until
  }

  /** Background work (the calibration sampler) only runs while users leave more than half the budget. */
  spare(now = Date.now()): boolean {
    return !this.blocked(now) && this.used(now) < this.perMinute / 2
  }

  /** Call before every request: throws instead of sending when blocked or over budget. */
  take(now = Date.now()) {
    if (this.blocked(now)) throw new RateLimited(`${this.name}: rate limited, waiting`)
    if (this.used(now) >= this.perMinute) throw new RateLimited(`${this.name}: over our own budget`)
    this.sent.push(now)
  }

  /** Call with every answer. Throws RateLimited (and starts the back-off) on a rate-limit answer. */
  answer(status: number, body: string, now = Date.now()) {
    if (isRateLimited(status, body)) {
      this.backoffMs = this.backoffMs ? Math.min(this.backoffMs * 2, this.maxMs) : this.minMs
      this.until = now + this.backoffMs
      throw new RateLimited(`${this.name}: rate limit exceeded`)
    }
    if (status >= 200 && status < 300) {
      this.backoffMs = 0
      this.until = 0
    }
  }
}

// Budgets: well above what the app needs (each line is cached for 10-15 s and shared by all users),
// well below the request rate that got İETT banned.
export const iettUpstream = new Upstream('İETT', 40)
export const egoUpstream = new Upstream('EGO', 40)
export const burulasUpstream = new Upstream('BURULAŞ', 40)
