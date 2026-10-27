// İBB's open API (İETT SOAP, Metro İstanbul REST) answers only Turkish addresses: since late October 2026
// requests from our server in Milan get no answer at all. IBB_RELAY points at a small relay on an always-on
// machine in Turkey, inside our tailnet (infra/ibb-relay.mjs), which forwards to api.ibb.gov.tr. The relay is
// tried first, then İBB directly (in case the block is lifted, or the relay machine is off).

export const IBB = 'https://api.ibb.gov.tr'

/** Where to send İBB requests, in order: the relay (when set), then İBB itself. */
export function ibbBases(relay = process.env.IBB_RELAY): string[] {
  const r = relay?.trim().replace(/\/+$/, '')
  return r ? [r, IBB] : [IBB]
}

/** An İBB request (`path` like "/iett/..."): through the relay first, then directly. Each try has its own timeout. */
export async function ibbFetch(path: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  let last: unknown
  for (const base of ibbBases()) {
    try {
      return await fetch(base + path, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      last = e
    }
  }
  throw last
}
