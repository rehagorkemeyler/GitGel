import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function stubBrowser(href: string, stored: string | null = null) {
  const store = new Map<string, string>(stored ? [['gg-city', stored]] : [])
  const replaced: string[] = []
  vi.stubGlobal('location', new URL(href))
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
  vi.stubGlobal('history', { state: null, replaceState: (_s: unknown, _t: string, u: string) => replaced.push(u) })
  return { store, replaced }
}

it('opens the city named in ?city= and remembers it', async () => {
  const { store, replaced } = stubBrowser('https://x.io/GitGel/?city=ankara&a=1', 'bursa')
  const m = await import('./city')
  expect(m.CITY.id).toBe('ankara')
  expect(m.CITY_CHOSEN).toBe(true)
  expect(store.get('gg-city')).toBe('ankara')
  expect(replaced).toEqual(['https://x.io/GitGel/?a=1'])
})

it('ignores an unknown ?city= and keeps the saved choice', async () => {
  const { replaced } = stubBrowser('https://x.io/GitGel/?city=izmir', 'bursa')
  const m = await import('./city')
  expect(m.CITY.id).toBe('bursa')
  expect(replaced).toEqual([])
})
