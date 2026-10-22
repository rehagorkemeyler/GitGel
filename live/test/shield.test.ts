import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClientBudget, CloudBlock, allowedOrigins, clientIp, isLocal, parseAws, parseGcp } from '../src/shield.ts'

test('proxy hops and missing addresses are not budgeted as one client', () => {
  assert.ok(isLocal('127.0.0.1'))
  assert.ok(isLocal('100.101.1.2'))
  assert.ok(isLocal('::1'))
  assert.ok(isLocal('?'))
  assert.ok(!isLocal('88.230.1.2'))
})

const req = (headers: Record<string, string>, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } }) as never

test('client IP is the proxy-appended entry, not a spoofed header', () => {
  assert.equal(clientIp(req({ 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '6.6.6.6, 88.230.1.2' })), '88.230.1.2')
  assert.equal(clientIp(req({ 'cf-connecting-ip': '6.6.6.6' }, '::ffff:88.230.1.2')), '88.230.1.2')
  assert.equal(clientIp(req({ 'cf-connecting-ip': '88.230.1.2', 'x-forwarded-for': '6.6.6.6' }), true), '88.230.1.2')
  assert.equal(clientIp({} as never), '?')
})

test('origin allowlist from env, trailing slashes ignored', () => {
  const o = allowedOrigins('https://gitgel.vercel.app/, http://localhost:5173')
  assert.ok(o.has('https://gitgel.vercel.app'))
  assert.ok(!o.has('https://rayist-509917.web.app'))
  assert.ok(allowedOrigins(undefined).has('https://rehagorkemeyler.github.io'))
  assert.ok(allowedOrigins(undefined).has('https://gitgel.vercel.app'))
})

test('per-IP budget refills over a minute', () => {
  let t = 0
  const b = new ClientBudget(3, () => t)
  assert.deepEqual([b.allow('a'), b.allow('a'), b.allow('a'), b.allow('a')], [true, true, true, false])
  assert.ok(b.allow('b'))
  t = 20_000
  assert.ok(b.allow('a'))
  assert.ok(!b.allow('a'))
})

test('cloud ranges block data-centre addresses only', () => {
  const c = new CloudBlock()
  assert.ok(!c.blocked('34.1.2.3'))
  const gcp = parseGcp({ prefixes: [{ ipv4Prefix: '34.0.0.0/15' }, { ipv6Prefix: '2600:1900::/35' }] })
  const aws = parseAws({
    prefixes: [{ ip_prefix: '3.5.0.0/16', service: 'EC2' }, { ip_prefix: '13.32.0.0/15', service: 'CLOUDFRONT' }],
    ipv6_prefixes: [],
  })
  c.load({ v4: [...gcp.v4, ...aws.v4, 'junk'], v6: gcp.v6 })
  assert.equal(c.size, 3)
  assert.ok(c.blocked('34.1.2.3'))
  assert.ok(c.blocked('2600:1900::1'))
  assert.ok(c.blocked('3.5.9.9'))
  assert.ok(!c.blocked('13.32.1.1'))
  assert.ok(!c.blocked('88.230.1.2'))
})

test('server refuses other sites and serves our own', async () => {
  const { handle } = await import('../src/server.ts')
  const call = async (origin?: string) => {
    const out: { code?: number; headers: Record<string, string> } = { headers: {} }
    const res = {
      setHeader: (k: string, v: string) => (out.headers[k] = v),
      writeHead: (code: number) => (out.code = code),
      end: () => {},
    }
    await handle({ url: '/live/vehicles?line=!', method: 'GET', headers: origin ? { origin } : {}, socket: {} } as never, res as never)
    return out
  }
  assert.equal((await call('https://rayist-509917.web.app')).code, 403)
  const ours = await call('https://rehagorkemeyler.github.io')
  assert.equal(ours.code, 400)
  assert.equal(ours.headers['Access-Control-Allow-Origin'], 'https://rehagorkemeyler.github.io')
  assert.equal((await call()).code, 400)
})
