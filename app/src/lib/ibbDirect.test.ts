import { describe, expect, it } from 'vitest'
import { extractResult, istanbulToIso, parseVehicles, stripHtml, linesIn } from './ibbDirect'

describe('İBB direct (same parsing as the live service)', () => {
  it('reads the JSON inside the SOAP envelope and keeps fresh buses only', () => {
    const json = JSON.stringify([
      { kapino: 'A-1', enlem: '41.0', boylam: '29.0', hatkodu: '500T', yon: 'X', son_konum_zamani: '2026-10-27 04:00:00' },
      { kapino: 'A-2', enlem: '41.0', boylam: '29.0', hatkodu: '500T', yon: 'X', son_konum_zamani: '2026-10-27 01:00:00' },
    ])
    const xml = `<soap><GetHatOtoKonum_jsonResult>${json.replace(/"/g, '&quot;')}</GetHatOtoKonum_jsonResult></soap>`
    const now = Date.parse(istanbulToIso('2026-10-27 04:01:00'))
    expect(parseVehicles(extractResult(xml, 'GetHatOtoKonum_json'), now).map((v) => v.id)).toEqual(['A-1'])
  })
  it('cleans Metro İstanbul texts', () => {
    expect(stripHtml('<p>M7 &ccedil;alışıyor&nbsp;</p>')).toBe('M7 çalışıyor')
    expect(linesIn('M7 ve T5 hatları')).toEqual(['M7', 'T5'])
  })
})
