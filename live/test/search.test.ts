import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CITIES, distanceM, parseStreetNumber, rank, search, toResult } from '../src/search.ts'

const sample = (f: string) => JSON.parse(readFileSync(new URL(`../../docs/api-samples/photon/${f}`, import.meta.url), 'utf8'))
const ME: [number, number] = [39.8716, 32.858] // Hilal, Ankara

test('street number + house number', () => {
  assert.deepEqual(parseStreetNumber('530 13'), { street: '530', house: '13' })
  assert.deepEqual(parseStreetNumber('530 no 13'), { street: '530', house: '13' })
  assert.deepEqual(parseStreetNumber('530/13A'), { street: '530', house: '13A' })
  assert.equal(parseStreetNumber('sancak 530'), null)
  assert.equal(parseStreetNumber('11654'), null)
})

test('results: name, address line, distance; nearest first inside the city', () => {
  const rows = sample('coffeelab.json').features.map((f: never) => toResult(f, ME))
  assert.ok(rows.every((r: { distance: number }) => r.distance > 0))
  const r = rank(rows, CITIES.ankara)
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].distance <= r[i].distance)
  assert.match(r[0].sub, /Çankaya/)
  // Outside the city: dropped.
  assert.equal(rank([{ ...r[0], lat: 41.0, lon: 29.0 }], CITIES.ankara).length, 0)
  assert.ok(Math.abs(distanceM([39.92, 32.85], [39.93, 32.85]) - 1112) < 5)
})

test('search: "530 13" points at the nearest 530. Sokak; "coffeelab kızılay" searches around Kızılay', async () => {
  const real = globalThis.fetch
  const asked: string[] = []
  globalThis.fetch = (async (u: string) => {
    const q = new URL(u).searchParams.get('q') ?? ''
    asked.push(q)
    const file = q === '530. Sokak' ? '530-sokak.json' : q === 'kızılay' ? 'kizilay.json' : q === 'coffeelab' ? 'coffeelab.json' : null
    return new Response(JSON.stringify(file ? sample(file) : { features: [] }))
  }) as typeof fetch
  try {
    const a = await search('530 13', 'ankara', ME)
    assert.equal(a[0].name, '530. Sokak No 13')
    assert.equal(a[0].kind, 'address')
    const b = await search('coffeelab kızılay', 'ankara', ME)
    assert.ok(b.length > 0 && b.every((x) => /coffee ?lab/i.test(x.name)))
    assert.ok(asked.includes('kızılay') && asked.includes('coffeelab'))
    assert.deepEqual(await search('x', 'izmir', ME), [])
  } finally {
    globalThis.fetch = real
  }
})
