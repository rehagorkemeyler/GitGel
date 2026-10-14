/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The bus bubble keeps the native VehicleBubble geometry (native src/map/LiveLayer.tsx) and the glass
// surface the owner chose for floating surfaces and cards. Vitest blanks ?raw CSS imports, so the file
// is read from disk, as in styles/tokens.test.ts.
const css = readFileSync(new URL('./VehicleBubble.css', import.meta.url), 'utf8')

/** Declarations of the rule for one selector, whitespace collapsed. Empty when the rule is missing. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  return body.replace(/\s+/g, ' ').trim()
}

describe('bus bubble geometry matches native VehicleBubble', () => {
  it('the marker padding lifts the tail just above the 30 px bus marker', () => {
    expect(rule('.bus-bubble-anchor')).toContain('padding-bottom: 18px;')
  })

  it('the bubble and card are 250 px wide', () => {
    expect(rule('.bus-bubble')).toContain('width: 250px;')
    expect(rule('.bus-card')).toContain('width: 250px;')
  })

  it('the card has radius 14, a 1 px hairline, padding 9/12 and a 4 px gap', () => {
    const card = rule('.bus-card')
    expect(card).toContain('border-radius: 14px;')
    expect(card).toContain('border: 1px solid var(--glass-edge);')
    expect(card).toContain('padding: 9px 12px;')
    expect(card).toContain('gap: 4px;')
  })

  it('the tail is 14 px wide and 8 px tall', () => {
    const tail = rule('.bus-tail')
    expect(tail).toContain('width: 14px;')
    expect(tail).toContain('height: 8px;')
  })
})

describe('bus bubble surface is the glass token, with no shadow', () => {
  it('card and tail take the glass background and blur', () => {
    for (const r of [rule('.bus-card'), rule('.bus-tail')]) {
      expect(r).toContain('background: var(--glass-bg);')
      expect(r).toContain('backdrop-filter: var(--glass-blur);')
    }
  })

  it('the card has no shadow', () => {
    expect(rule('.bus-card')).toContain('box-shadow: none;')
  })
})
