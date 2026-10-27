import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBoard } from '../src/providers/iettBoard.ts'

const item = (line: string, route: string, bold: string) =>
  `<div class="line-item"><div class="content"><span>${line}</span><p>${route} <b>${bold}</b></p></div></div>`
const page = (items: string) =>
  `<div class="departure-times-header"><b>Notlar</b></div><div class="line-list"><div class="line-item"><div class="content content-header"><p>Duraktan Geçen Otobüsler <small>Varış Süresi</small></p></div></div>${items}</div>`

test('İETT stop board: live buses soonest first, "B" (not live) left out', () => {
  const a = parseBoard(
    page(item('500T', 'ŞİFA SONDURAK  -  4.LEVENT METRO', '(05:27) 9 dk') + item('130Ş', 'ŞİFA - KADIKÖY', '(05:30) B 3 dk') + item('500T', 'ŞİFA SONDURAK - 4.LEVENT METRO', '(05:27) 4 dk')),
  )
  assert.deepEqual(a.map((x) => [x.line, x.etaSeconds]), [['500T', 240], ['500T', 540]])
  assert.equal(a[0].lineName, 'Şifa Sondurak - 4.Levent Metro')
  assert.equal(a[0].stopsAway, null)
})

test('İETT stop board: an empty board is no buses, an error page throws', () => {
  assert.deepEqual(parseBoard(page('')), [])
  assert.throws(() => parseBoard('<html>Hata</html>'))
})
