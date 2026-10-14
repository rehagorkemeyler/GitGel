import { describe, expect, it } from 'vitest'
import { SNAP } from './sheet'
import { defaultSnapOf, isTrip, popPanels, resetPanels, type Panel } from './panels'

const home: Panel = { kind: 'home' }
const results: Panel = { kind: 'results' }
const route = { kind: 'route', it: {} as never } as Panel
const search: Panel = { kind: 'search', which: 'to' }

describe('panel kinds', () => {
  it('treats results, route and search as trip panels', () => {
    expect([results, route, search].every(isTrip)).toBe(true)
    expect([home, { kind: 'lines' } as Panel, { kind: 'about' } as Panel].some(isTrip)).toBe(false)
  })

  it('opens each panel at its native default snap', () => {
    expect(defaultSnapOf(home)).toBe(SNAP.peek)
    expect(defaultSnapOf(search)).toBe(SNAP.full)
    expect(defaultSnapOf({ kind: 'about' })).toBe(SNAP.full)
    for (const kind of ['lines', 'nearby', 'contact', 'support'] as const) expect(defaultSnapOf({ kind })).toBe(SNAP.mid)
    expect(defaultSnapOf(results)).toBe(SNAP.def)
    expect(defaultSnapOf(route)).toBe(SNAP.def)
  })
})

describe('resetPanels and popPanels', () => {
  it('closing a trip from a route removes the trip panels and keeps home', () => {
    expect(resetPanels([home, search, results, route], (p) => !isTrip(p), null)).toEqual([home])
  })

  it('keeps the panels below a trip when a trip is closed', () => {
    const lines: Panel = { kind: 'lines' }
    expect(resetPanels([home, lines, results], (p) => !isTrip(p), null)).toEqual([home, lines])
  })

  it('opens the top panel on the kept base', () => {
    expect(resetPanels([home, search], (p) => !isTrip(p), results)).toEqual([home, results])
  })

  it('back never removes home', () => {
    expect(popPanels([home])).toEqual([home])
    expect(popPanels([home, results, route])).toEqual([home, results])
  })
})
