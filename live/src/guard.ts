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
  private stats = { sent: 0, overBudget: 0, limited: 0 }

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
    if (this.used(now) >= this.perMinute) {
      this.stats.overBudget++
      throw new RateLimited(`${this.name}: over our own budget`)
    }
    this.sent.push(now)
    this.stats.sent++
  }

  /** "İETT: 312 sent, 0 over budget, 1 rate-limited in the last hour", then the counts start again. */
  report(): string {
    const { sent, overBudget, limited } = this.stats
    this.stats = { sent: 0, overBudget: 0, limited: 0 }
    return `${this.name}: ${sent} sent, ${overBudget} over budget, ${limited} rate-limited in the last hour`
  }

  /** Call with every answer. Throws RateLimited (and starts the back-off) on a rate-limit answer. */
  answer(status: number, body: string, now = Date.now()) {
    if (isRateLimited(status, body)) {
      this.stats.limited++
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

// Budgets: each line is cached for 10-30 s and shared by all users, so these cover many users.
// İETT is the tightest: the İBB gateway banned us at one request every 5 s, and again within the hour
// at one every 30 s plus users (its quota is not published).
export const iettUpstream = new Upstream('İETT', 15)
export const egoUpstream = new Upstream('EGO', 40)
export const burulasUpstream = new Upstream('BURULAŞ', 40)
