/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACCENT, LIVE_COLOR } from './colors'

// The map colours in colors.ts must match the CSS tokens, so the map and the UI agree.
// (Vitest blanks ?raw CSS imports, so the file is read from disk.)
const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
const light = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'))
const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('@supports not'))

/** Value of a custom property declared in a block, or undefined when the block does not set it. */
function token(block: string, name: string): string | undefined {
  return block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
}

describe('map colours match the tokens', () => {
  it('accent is the same in both schemes', () => {
    expect(token(light, '--accent')).toBe(ACCENT)
    expect(token(dark, '--accent')).toBeUndefined()
  })

  it('live green is #1f9d45 in light and #34c759 in dark', () => {
    expect(token(light, '--live')).toBe(LIVE_COLOR.light)
    expect(token(dark, '--live')).toBe(LIVE_COLOR.dark)
    expect(LIVE_COLOR).toEqual({ light: '#1f9d45', dark: '#34c759' })
  })
})
