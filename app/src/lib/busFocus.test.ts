import { describe, expect, it } from 'vitest'
import { directionPaths, stopToStopIds } from './busFocus'
import type { StopRow } from './data'
import type { LineDetail } from './lineDetail'

const stop = (id: string, lat: number, lon: number) => ({ id, name: id, lat, lon, mode: 'bus', lines: [] }) as StopRow

describe('stopToStopIds', () => {
  const modes: Record<string, string> = { M2: 'metro', T1: 'tram', '34': 'bus', F1: 'ferry' }
  const modeOf = (id: string) => modes[id]

  it('keeps buses and ferries, drops the network modes', () => {
    expect(stopToStopIds(['M2', '34', 'T1', 'F1'], modeOf)).toEqual(['34', 'F1'])
  })

  it('treats a line of unknown mode as a bus', () => {
    expect(stopToStopIds(['XX'], modeOf)).toEqual(['XX'])
  })
})

describe('directionPaths', () => {
  const stops = [stop('a', 41.0, 29.0), stop('b', 41.1, 29.1), stop('c', 41.2, 29.2)]
  const detail = (...dirs: string[][]): LineDetail =>
    ({ directions: dirs.map((s) => ({ headsign: '', stops: s, first_last: {} })) }) as unknown as LineDetail

  it('builds [lon, lat] paths per direction and skips missing stops', () => {
    const paths = directionPaths([detail(['a', 'missing', 'b', 'c'])], stops)
    expect(paths).toEqual([
      [
        [29.0, 41.0],
        [29.1, 41.1],
        [29.2, 41.2],
      ],
    ])
  })

  it('drops paths with fewer than two positions and null details', () => {
    expect(directionPaths([null, detail(['a'], ['a', 'b'])], stops)).toEqual([
      [
        [29.0, 41.0],
        [29.1, 41.1],
      ],
    ])
  })
})
