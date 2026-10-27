// İBB relay: runs on an always-on machine in Turkey (Görkem's Mac, in Docker), reached only through our tailnet.
// İBB's API answers Turkish addresses only, so the live service sends its İETT and Metro İstanbul requests here
// (IBB_RELAY) and this forwards them to api.ibb.gov.tr unchanged. Nothing else is forwarded.
//
//   docker run -d --name ibb-relay --restart unless-stopped -p 8888:8888 \
//     -v "$PWD/ibb-relay.mjs:/relay.mjs:ro" node:24-alpine node /relay.mjs

import { createServer } from 'node:http'

const TARGET = 'https://api.ibb.gov.tr'
// Only the two APIs GitGel uses.
const ALLOWED = /^\/(iett\/|MetroIstanbul\/)/
const PORT = Number(process.env.PORT) || 8888

createServer(async (req, res) => {
  const path = req.url ?? '/'
  if (path === '/health') return res.writeHead(200).end('ok')
  if (!ALLOWED.test(path) || (req.method !== 'GET' && req.method !== 'POST')) return res.writeHead(404).end()
  try {
    const chunks = []
    for await (const c of req) {
      chunks.push(c)
      if (chunks.reduce((n, x) => n + x.length, 0) > 64_000) return res.writeHead(413).end()
    }
    const headers = {}
    for (const h of ['content-type', 'soapaction', 'accept']) if (req.headers[h]) headers[h] = req.headers[h]
    const r = await fetch(TARGET + path, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const body = Buffer.from(await r.arrayBuffer())
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream' }).end(body)
  } catch (e) {
    console.error(`${path}: ${e?.message ?? e}`)
    res.writeHead(502).end()
  }
}).listen(PORT, () => console.log(`ibb relay on :${PORT}`))
