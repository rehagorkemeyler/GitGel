import { expect, it } from 'vitest'
import { groupDepartures } from './departures'

const st = (line: string, head: string, t: string) => ({ routeShortName: line, headsign: head, place: { name: 'x', lat: 0, lon: 0, departure: t } })

it('groups by line and direction, keeps the soonest first', () => {
  const g = groupDepartures([
    st('M2', 'Hacıosman', '2026-09-29T05:03:00Z'),
    st('Marmaray', 'Gebze', '2026-09-29T05:02:00Z'),
    st('M2', 'Hacıosman', '2026-09-29T05:08:00Z'),
    st('M2', 'Yenikapı', '2026-09-29T05:10:00Z'),
  ])
  expect(g.map((x) => `${x.line}>${x.headsign}:${x.times.length}`)).toEqual(['Marmaray>Gebze:1', 'M2>Hacıosman:2', 'M2>Yenikapı:1'])
})
