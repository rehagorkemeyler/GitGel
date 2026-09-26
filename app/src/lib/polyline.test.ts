import { expect, it } from 'vitest'
import { decodePolyline } from './polyline'

it('decodes the reference polyline', () => {
  // Example from the Google polyline spec, precision 5.
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)
  expect(pts).toEqual([
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ])
})
