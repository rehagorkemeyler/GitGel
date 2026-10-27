import { describe, expect, it } from 'vitest'
import { groupClusterStops, sortedLines } from './stopCluster'

const stop = (id: string, name: string, lat: number, lines: string[] = []) => ({ id, name, lat, lon: 32.85, lines })

describe('groupClusterStops', () => {
  it('groups by name, nearest group first, stops by number', () => {
    const g = groupClusterStops(
      [stop('eg_11615', 'Kızılay', 39.9201), stop('eg_10927', 'Meşrutiyet Caddesi', 39.9205), stop('eg_11613', 'KIZILAY ', 39.9202), stop('eg_10876', 'Meşrutiyet  Caddesi', 39.9206)],
      { lat: 39.92, lon: 32.85 },
    )
    expect(g.map((x) => x.name)).toEqual(['Kızılay', 'Meşrutiyet Caddesi'])
    expect(g[0].stops.map((s) => s.id)).toEqual(['eg_11613', 'eg_11615'])
    expect(g[1].stops.map((s) => s.id)).toEqual(['eg_10876', 'eg_10927'])
  })
})

describe('sortedLines', () => {
  it('sorts line numbers as numbers and drops repeats', () => {
    expect(sortedLines(['339', '131-5', '131', '185-2', '43', '131'])).toEqual(['43', '131', '131-5', '185-2', '339'])
  })
})
