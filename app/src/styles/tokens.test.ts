/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The shared tokens must keep the native values (native src/theme/tokens.ts).
// (Vitest blanks ?raw CSS imports, so the file is read from disk.)
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const light = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'))
const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('@supports not'))

/** Value of a custom property declared in a block, with spaces removed so rgba() values compare exactly. */
function token(block: string, name: string): string | undefined {
  return block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].replace(/\s/g, '')
}

describe('shared tokens match native', () => {
  it('light palette', () => {
    expect(token(light, '--bg')).toBe('#f2f3f5')
    expect(token(light, '--text')).toBe('#111111')
    expect(token(light, '--text-2')).toBe('#7b7b84')
    expect(token(light, '--accent')).toBe('#2f7cf6')
    expect(token(light, '--accent-text')).toBe('#ffffff')
    expect(token(light, '--live')).toBe('#1f9d45')
    expect(token(light, '--fill')).toBe('rgba(0,0,0,0.05)')
    expect(token(light, '--hairline')).toBe('rgba(0,0,0,0.06)')
    expect(token(light, '--handle')).toBe('rgba(0,0,0,0.18)')
    expect(token(light, '--warning-text')).toBe('#8a5a00')
    expect(token(light, '--warning-bg')).toBe('#fff3dc')
    expect(token(light, '--sheet-solid')).toBe('#ffffff')
  })

  it('dark palette', () => {
    expect(token(dark, '--bg')).toBe('#0c0d10')
    expect(token(dark, '--text')).toBe('#f5f5f7')
    expect(token(dark, '--text-2')).toBe('#9a9aa3')
    expect(token(dark, '--live')).toBe('#34c759')
    expect(token(dark, '--fill')).toBe('rgba(255,255,255,0.08)')
    expect(token(dark, '--hairline')).toBe('rgba(255,255,255,0.08)')
    expect(token(dark, '--handle')).toBe('rgba(255,255,255,0.28)')
    expect(token(dark, '--warning-text')).toBe('#ffb340')
    expect(token(dark, '--sheet-solid')).toBe('#1c1e24')
  })

  it('accent and accent text are not overridden in dark', () => {
    expect(token(dark, '--accent')).toBeUndefined()
    expect(token(dark, '--accent-text')).toBeUndefined()
  })

  it('glass uses the native sheet tint and blur, with a hairline edge and no rim, sheen or shadow', () => {
    expect(token(light, '--glass-bg')).toBe('rgba(255,255,255,0.72)')
    expect(token(dark, '--glass-bg')).toBe('rgba(28,30,36,0.66)')
    expect(token(light, '--glass-blur')).toBe('blur(28px)')
    expect(token(light, '--glass-edge')).toBe('rgba(0,0,0,0.06)')
    expect(token(dark, '--glass-edge')).toBe('rgba(255,255,255,0.08)')
    expect(token(light, '--glass-rim')).toBe('none')
    expect(token(light, '--glass-shine')).toBe('none')
  })

  it('shadow is only the native raised pill, the same in both schemes (floating surfaces have none)', () => {
    expect(token(light, '--shadow')).toBe('0 1px 4px rgba(0, 0, 0, 0.08)'.replace(/\s/g, ''))
    expect(token(dark, '--shadow')).toBeUndefined()
  })

  it('radii: sheet 38, card 20, pill 999', () => {
    expect(token(light, '--r-sheet')).toBe('38px')
    expect(token(light, '--r-card')).toBe('20px')
    expect(token(light, '--r-pill')).toBe('999px')
  })
})
