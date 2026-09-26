// İETT live vehicle positions (SOAP, no key). The JSON payload is a string
// inside the SOAP envelope.

const URL_FILO = 'https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx'

export type Vehicle = {
  id: string
  lat: number
  lon: number
  line: string
  pattern: string
  headsign: string
  at: string // ISO time of the GPS fix
  nearStop: string
}

type RawVehicle = {
  kapino: string
  enlem: string
  boylam: string
  hatkodu: string
  guzergahkodu: string
  yon: string
  son_konum_zamani: string
  yakinDurakKodu: string
}

export const MAX_AGE_MS = 5 * 60 * 1000

function envelope(op: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op} xmlns="http://tempuri.org/">${body}</${op}></soap:Body></soap:Envelope>`
}

export function extractResult(xml: string, op: string): string {
  const m = xml.match(new RegExp(`<${op}Result>([\\s\\S]*)</${op}Result>`))
  if (!m) throw new Error(`${op}: no result in response`)
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

/** "2026-09-26 03:52:52" is Istanbul time (UTC+3, no DST). */
export function istanbulToIso(s: string): string {
  return new Date(s.replace(' ', 'T') + '+03:00').toISOString()
}

export function parseVehicles(json: string, now: number): Vehicle[] {
  const raw = JSON.parse(json) as RawVehicle[]
  const out: Vehicle[] = []
  for (const r of raw) {
    const lat = Number(r.enlem)
    const lon = Number(r.boylam)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue
    const at = istanbulToIso(r.son_konum_zamani)
    // Parked buses keep reporting hours-old positions: never show them as live.
    if (now - Date.parse(at) > MAX_AGE_MS) continue
    out.push({
      id: r.kapino,
      lat,
      lon,
      line: r.hatkodu,
      pattern: r.guzergahkodu,
      headsign: r.yon,
      at,
      nearStop: r.yakinDurakKodu,
    })
  }
  return out
}

export async function fetchLineVehicles(line: string, now = Date.now()): Promise<Vehicle[]> {
  const op = 'GetHatOtoKonum_json'
  const safe = line.replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü-]/g, '')
  const r = await fetch(URL_FILO, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"http://tempuri.org/${op}"` },
    body: envelope(op, `<HatKodu>${safe}</HatKodu>`),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`İETT HTTP ${r.status}`)
  return parseVehicles(extractResult(await r.text(), op), now)
}
