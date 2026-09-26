import { expect, it } from 'vitest'
import { istanbulDate, istanbulParts } from './when'

it('treats picked times as Istanbul time', () => {
  const d = istanbulDate('2026-09-29', '08:30')
  expect(d.toISOString()).toBe('2026-09-29T05:30:00.000Z')
  expect(istanbulParts(d)).toEqual({ day: '2026-09-29', time: '08:30' })
})
