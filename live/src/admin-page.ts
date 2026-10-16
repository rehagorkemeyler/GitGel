
export const PAGE_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>GitGel Admin</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" integrity="sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V" crossorigin="anonymous">
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header class="top">
  <h1>GitGel <span>Admin</span></h1>
  <nav class="tabs" role="tablist">
    <button data-tab="overview" class="on">Genel</button>
    <button data-tab="visitors">Ziyaretçiler</button>
    <button data-tab="map">Konum</button>
    <button data-tab="feed">Canlı akış</button>
    <button data-tab="alltime">Tüm zamanlar</button>
  </nav>
  <div class="range" id="range">
    <button data-days="1">24 saat</button>
    <button data-days="7" class="on">7 gün</button>
    <button data-days="30">30 gün</button>
    <button data-days="90">90 gün</button>
  </div>
</header>
<main>
  <section id="overview" class="tab on">
    <div class="kpis" id="kpis"></div>
    <div class="card wide"><h2 id="seriesTitle">Günlük ziyaretçi</h2><div class="chart" id="series"></div></div>
    <div class="card wide"><h2>Günün saatine göre ziyaretçi (İstanbul saati)</h2><div class="chart" id="hours"></div></div>
    <div class="grid" id="tops"></div>
  </section>
  <section id="visitors" class="tab">
    <div class="toolbar"><input id="vsearch" type="search" placeholder="IP, şehir, cihaz, UTM ya da kimlik ara" autocomplete="off"></div>
    <div class="card"><div class="scroll"><table id="vtable"></table></div></div>
    <div class="card" id="vdetail" hidden></div>
  </section>
  <section id="map" class="tab">
    <div class="card wide"><h2 id="mapTitle">Konum (100 m hücre, kişiyle eşleşmez)</h2><div id="mapbox"></div></div>
    <div class="card"><div class="scroll"><table id="celltable"></table></div></div>
  </section>
  <section id="feed" class="tab">
    <div class="toolbar"><span class="muted" id="feedNote"></span></div>
    <div class="card"><div class="scroll"><table id="ftable"></table></div></div>
  </section>
  <section id="alltime" class="tab">
    <div class="card wide"><h2>Her gün ziyaretçi (ilk günden bugüne)</h2><div class="chart" id="allchart"></div></div>
    <div class="card"><div class="scroll"><table id="alltable"></table></div></div>
  </section>
</main>
<footer class="muted">Ham kayıtlar 90 gün tutulur, günlük toplamlar süresiz. Konum IP'den tahmindir: <a href="https://db-ip.com" rel="noreferrer">IP Geolocation by DB-IP</a>.</footer>
<div class="tip" id="tip" hidden></div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js" integrity="sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj" crossorigin="anonymous"></script>
<script src="/app.js"></script>
</body>
</html>`

export const PAGE_CSS = `
:root {
  color-scheme: light;
  --bg: #f4f3f0; --surface: #fcfcfb; --line: #e4e2dd; --text: #0b0b0b; --text-2: #52514e; --muted: #8a8884;
  --accent: #2a78d6; --accent-soft: #cde2fb; --good: #0ca30c;
}
@media (prefers-color-scheme: dark) {
  :root { color-scheme: dark; --bg: #121211; --surface: #1a1a19; --line: #2e2e2c; --text: #f2f1ee; --text-2: #b5b3ae; --muted: #85837e;
    --accent: #3987e5; --accent-soft: #1c3a5e; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
a { color: var(--accent); }
.muted { color: var(--muted); }
.top { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; padding: 12px 16px;
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--line); }
h1 { margin: 0; font-size: 18px; } h1 span { color: var(--muted); font-weight: 500; }
h2 { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--text-2); }
.tabs, .range { display: flex; gap: 4px; flex-wrap: wrap; }
.range { margin-left: auto; }
button { font: inherit; border: 1px solid var(--line); background: var(--surface); color: var(--text-2); padding: 6px 12px; border-radius: 8px; cursor: pointer; }
button.on { background: var(--text); color: var(--bg); border-color: var(--text); }
main { padding: 16px; max-width: 1400px; margin: 0 auto; }
.tab { display: none; } .tab.on { display: block; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 12px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.kpi b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; font-weight: 650; }
.kpi span { color: var(--text-2); font-size: 12px; }
.kpi.live b { color: var(--good); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 12px; min-width: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.grid .card { margin: 0; }
.chart svg { display: block; width: 100%; height: 200px; }
.chart .bar { fill: var(--accent); }
.chart .bar:hover, .chart .bar.hl { fill: var(--text); }
.chart .axis { fill: var(--muted); font-size: 10px; }
.chart .grid-line { stroke: var(--line); stroke-width: 1; }
.empty { color: var(--muted); padding: 16px 0; }
.toplist { width: 100%; border-collapse: collapse; table-layout: fixed; }
.toplist td { padding: 4px 0; vertical-align: middle; }
.toplist td.k { width: 45%; padding-right: 8px; overflow-wrap: anywhere; }
.toplist td.n { width: 112px; text-align: right; font-variant-numeric: tabular-nums; color: var(--text-2); white-space: nowrap; padding-left: 8px; }
.meter { height: 6px; border-radius: 3px; background: var(--accent-soft); overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--accent); border-radius: 0 3px 3px 0; }
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
input[type=search] { flex: 1; max-width: 480px; font: inherit; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); }
.scroll { overflow-x: auto; }
table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
table.data th { text-align: left; color: var(--muted); font-weight: 500; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
table.data td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
table.data tr.click { cursor: pointer; } table.data tr.click:hover { background: var(--bg); }
table.data td.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.pill { display: inline-block; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--line); font-size: 11px; color: var(--text-2); white-space: nowrap; }
.detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 10px; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px 16px; margin-bottom: 12px; }
.facts div span { display: block; color: var(--muted); font-size: 11px; }
.tip { position: fixed; z-index: 5; pointer-events: none; background: var(--text); color: var(--bg); padding: 6px 9px; border-radius: 6px; font-size: 12px; white-space: pre; }
#mapbox { height: 520px; border-radius: 8px; overflow: hidden; }
footer { padding: 8px 16px 24px; max-width: 1400px; margin: 0 auto; font-size: 12px; }
@media (max-width: 640px) { .range { margin-left: 0; } .kpi b { font-size: 22px; } }
`

export const PAGE_JS = `
'use strict';
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('tr-TR');
const dtf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const state = { days: 7, tab: 'overview' };
const TYPE = { pageview: 'Açılış', search: 'Arama', route: 'Rota', line: 'Hat', station: 'Durak', city: 'Şehir' };
const LABELS = {
  country: 'Ülke', city: 'Şehir (IP)', device: 'Cihaz türü', model: 'Cihaz modeli', os: 'İşletim sistemi', browser: 'Tarayıcı / uygulama',
  ref: 'Nereden geldi (referrer)', utm_source: 'UTM source', utm_medium: 'UTM medium', utm_campaign: 'UTM campaign',
  utm_term: 'UTM term', utm_content: 'UTM content', app_city: 'Uygulamada seçilen şehir', lang: 'Dil', screen: 'Ekran boyutu',
};
const ACTIVITY = { q: 'Yazılan aramalar', place: 'Seçilen yerler', route: 'Aranan rotalar', line: 'Açılan hat ve duraklar' };

function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}
const svg = (tag, attrs) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); return n; };

async function api(path) {
  const r = await fetch(path, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(r.status + '');
  return r.json();
}
const q = () => 'days=' + state.days;

const tip = $('tip');
function showTip(e, text) { tip.textContent = text; tip.hidden = false; moveTip(e); }
function moveTip(e) { const x = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = (e.clientY - tip.offsetHeight - 10) + 'px'; }
function hideTip() { tip.hidden = true; }

function bars(host, rows, tickEvery) {
  host.replaceChildren();
  if (!rows.length) return host.append(el('div', { class: 'empty', text: 'Bu aralıkta veri yok.' }));
  const W = Math.max(host.clientWidth, 300), H = 200, padL = 34, padB = 22, padT = 8;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
  for (let v = 0; v <= top; v += step) {
    const y = padT + (H - padT - padB) * (1 - v / top);
    s.append(svg('line', { x1: padL, x2: W, y1: y, y2: y, class: 'grid-line' }));
    const t = svg('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', class: 'axis' }); t.textContent = fmt.format(v); s.append(t);
  }
  const bw = (W - padL) / rows.length;
  const gap = Math.min(2, bw * 0.2);
  rows.forEach((r, i) => {
    const h = (H - padT - padB) * (r.value / top);
    const x = padL + i * bw + gap / 2, y = H - padB - h, w = Math.max(1, bw - gap);
    const rad = Math.min(4, w / 2, h);
    const d = 'M' + x + ',' + (H - padB) + 'V' + (y + rad) + 'q0,-' + rad + ' ' + rad + ',-' + rad + 'H' + (x + w - rad) + 'q' + rad + ',0 ' + rad + ',' + rad + 'V' + (H - padB) + 'Z';
    if (h > 0) s.append(svg('path', { d, class: 'bar' }));
    const hit = svg('rect', { x: padL + i * bw, y: padT, width: bw, height: H - padT - padB, fill: 'transparent' });
    hit.addEventListener('mouseenter', (e) => showTip(e, r.tip));
    hit.addEventListener('mousemove', moveTip);
    hit.addEventListener('mouseleave', hideTip);
    s.append(hit);
    if (i % tickEvery === 0) { const t = svg('text', { x: x + w / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis' }); t.textContent = r.label; s.append(t); }
  });
  host.append(s);
}
function niceStep(max) { const raw = max / 4; const p = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 5, 10]) if (raw <= m * p) return Math.max(1, m * p); return p * 10; }

function topList(title, rows, unit) {
  const card = el('div', { class: 'card' }, el('h2', { text: title }));
  if (!rows.length) { card.append(el('div', { class: 'empty', text: 'Veri yok.' })); return card; }
  const max = Math.max(...rows.map((r) => r[unit]));
  const t = el('table', { class: 'toplist' });
  for (const r of rows) {
    const meter = el('div', { class: 'meter' }, el('i'));
    meter.firstChild.style.width = (100 * r[unit] / max).toFixed(1) + '%';
    t.append(el('tr', null, el('td', { class: 'k', text: r.key }), el('td', null, meter),
      el('td', { class: 'n', text: fmt.format(r.visitors) + ' kişi · ' + fmt.format(r.events) })));
  }
  card.append(t);
  return card;
}

async function loadOverview() {
  const d = await api('/api/summary?' + q());
  const k = d.totals;
  const kpi = (v, label, cls) => el('div', { class: 'kpi ' + (cls || '') }, el('b', { text: fmt.format(v || 0) }), el('span', { text: label }));
  $('kpis').replaceChildren(
    kpi(d.activeNow, 'Şu an (5 dk)', 'live'), kpi(k.visitors, 'Tekil ziyaretçi'), kpi(k.newVisitors, 'Yeni ziyaretçi'),
    kpi(k.sessions, 'Oturum'), kpi(k.pageviews, 'Açılış'), kpi(k.searches, 'Arama'), kpi(k.routes, 'Rota'));
  $('seriesTitle').textContent = d.hourly ? 'Saatlik ziyaretçi' : 'Günlük ziyaretçi';
  const rows = d.series.map((r) => ({ label: d.hourly ? r.bucket.slice(11, 13) : r.bucket.slice(8, 10) + '.' + r.bucket.slice(5, 7), value: r.visitors,
    tip: r.bucket + '\\n' + fmt.format(r.visitors) + ' ziyaretçi\\n' + fmt.format(r.pageviews || 0) + ' açılış\\n' + fmt.format(r.routes || 0) + ' rota' }));
  bars($('series'), rows, Math.max(1, Math.ceil(rows.length / 12)));
  const byHour = new Map(d.hours.map((h) => [h.hour, h]));
  bars($('hours'), Array.from({ length: 24 }, (_, h) => { const r = byHour.get(h) || { visitors: 0, events: 0 };
    return { label: String(h).padStart(2, '0'), value: r.visitors, tip: String(h).padStart(2, '0') + ':00 – ' + String(h).padStart(2, '0') + ':59\\n' + fmt.format(r.visitors) + ' ziyaretçi\\n' + fmt.format(r.events) + ' olay' }; }), 2);
  const grid = $('tops');
  grid.replaceChildren();
  for (const [key, title] of Object.entries(ACTIVITY)) grid.append(topList(title, d.activity[key], 'events'));
  for (const [key, title] of Object.entries(LABELS)) grid.append(topList(title, d.top[key], 'visitors'));
}

function table(host, head, rows) {
  host.className = 'data';
  host.replaceChildren(el('thead', null, el('tr', null, ...head.map((h) => el('th', { text: h })))));
  const body = el('tbody');
  for (const r of rows) body.append(r);
  host.append(body);
}
const td = (text, cls) => el('td', { class: cls || '', text: text == null ? '' : String(text) });
const when = (t) => dtf.format(new Date(t));
const where = (r) => [r.city, r.country].filter(Boolean).join(', ');
const device = (r) => [r.device, r.model, r.os, r.browser].filter(Boolean).join(' · ');
function what(e) {
  if (e.type === 'search') return (e.q ? '"' + e.q + '" → ' : '') + (e.place || '');
  if (e.type === 'route') return e.from_name + ' → ' + e.to_name;
  if (e.type === 'line' || e.type === 'station') return e.line;
  return e.path || '';
}

let vTimer;
async function loadVisitors() {
  const term = $('vsearch').value.trim();
  const d = await api('/api/visitors?' + q() + '&q=' + encodeURIComponent(term));
  table($('vtable'), ['Son görülme', 'İlk görülme', 'Konum', 'Cihaz', 'IP', 'Kaynak', 'Oturum', 'Arama', 'Rota', 'Olay'],
    d.visitors.map((v) => {
      const tr = el('tr', { class: 'click', onclick: () => openVisitor(v) },
        td(when(v.last)), td(when(v.first)), td(where(v)), td(device(v)), td(v.ip, 'mono'),
        td([v.utm_source, v.utm_campaign].filter(Boolean).join(' / ')), td(v.sessions, 'num'), td(v.searches, 'num'), td(v.routes, 'num'), td(v.events, 'num'));
      return tr;
    }));
}

async function openVisitor(v) {
  const box = $('vdetail');
  box.hidden = false;
  box.replaceChildren(el('div', { class: 'muted', text: 'Yükleniyor…' }));
  const d = await api('/api/visitor?vid=' + encodeURIComponent(v.vid));
  const ev = d.events;
  const ips = [...new Set(ev.map((e) => e.ip).filter(Boolean))];
  const places = [...new Set(ev.map((e) => where(e)).filter(Boolean))];
  const first = ev[ev.length - 1] || {};
  const utm = ev.filter((e) => e.utm_source).map((e) => [e.utm_source, e.utm_medium, e.utm_campaign, e.utm_term, e.utm_content].filter(Boolean).join(' / '));
  const fact = (label, value) => el('div', null, el('span', { text: label }), document.createTextNode(value || '—'));
  box.replaceChildren(
    el('div', { class: 'detail-head' }, el('h2', { text: 'Ziyaretçi ' + v.vid }), el('button', { text: 'Kapat', onclick: () => { box.hidden = true; } })),
    el('div', { class: 'facts' },
      fact('İlk görülme', when(v.first)), fact('Son görülme', when(v.last)), fact('Cihaz', device(first)), fact('Ekran / dil', [first.screen, first.lang].filter(Boolean).join(' · ')),
      fact('IP adresleri', ips.join(', ')), fact('Konumlar (IP)', places.join('; ')), fact('İlk UTM', utm[utm.length - 1]), fact('İlk referrer', (ev.slice().reverse().find((e) => e.ref) || {}).ref),
      fact('User-Agent', first.ua)),
  );
  const t = el('table');
  table(t, ['Zaman', 'Olay', 'Ne', 'Şehir (uyg.)', 'Konum (IP)', 'IP', 'Sayfa'],
    ev.map((e) => el('tr', null, td(when(e.t)), el('td', null, el('span', { class: 'pill', text: TYPE[e.type] || e.type })), td(what(e)), td(e.app_city), td(where(e)), td(e.ip, 'mono'), td(e.path, 'mono'))));
  box.append(el('div', { class: 'scroll' }, t));
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadFeed() {
  const d = await api('/api/recent');
  $('feedNote').textContent = 'Son 100 olay · 15 saniyede bir yenilenir · ' + new Date().toLocaleTimeString('tr-TR');
  table($('ftable'), ['Zaman', 'Olay', 'Ne', 'Konum (IP)', 'Cihaz', 'IP', 'Kaynak'],
    d.events.map((e) => el('tr', { class: 'click', onclick: () => { switchTab('visitors'); openVisitor({ vid: e.vid, first: e.t, last: e.t }); } },
      td(when(e.t)), el('td', null, el('span', { class: 'pill', text: TYPE[e.type] || e.type })), td(what(e)), td(where(e)), td(device(e)), td(e.ip, 'mono'), td(e.utm_source))));
}

async function loadAllTime() {
  const d = await api('/api/alltime');
  bars($('allchart'), d.days.map((r) => ({ label: r.day.slice(5).split('-').reverse().join('.'), value: r.visitors,
    tip: r.day + '\\n' + fmt.format(r.visitors) + ' ziyaretçi\\n' + fmt.format(r.sessions) + ' oturum\\n' + fmt.format(r.searches) + ' arama\\n' + fmt.format(r.routes) + ' rota' })), Math.max(1, Math.ceil(d.days.length / 12)));
  table($('alltable'), ['Gün', 'Ziyaretçi', 'Oturum', 'Açılış', 'Arama', 'Rota'],
    d.days.slice().reverse().map((r) => el('tr', null, td(r.day), td(fmt.format(r.visitors), 'num'), td(fmt.format(r.sessions), 'num'), td(fmt.format(r.pageviews), 'num'), td(fmt.format(r.searches), 'num'), td(fmt.format(r.routes), 'num'))));
}

let lmap;
async function loadMap() {
  const d = await api('/api/cells?' + q());
  const max = Math.max(1, ...d.cells.map((c) => c.n));
  const total = d.cells.reduce((a, c) => a + c.n, 0);
  $('mapTitle').textContent = 'Konum (100 m hücre, kişiyle eşleşmez) · ' + fmt.format(d.cells.length) + ' hücre · ' + fmt.format(total) + ' kayıt';
  const data = { type: 'FeatureCollection', features: d.cells.map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { n: c.n } })) };
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (!lmap) {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    lmap = new maplibregl.Map({ container: 'mapbox', style: 'https://tiles.openfreemap.org/styles/' + (dark ? 'dark' : 'positron'), center: [28.98, 41.03], zoom: 9.5 });
    lmap.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    await new Promise((r) => lmap.once('load', r));
    lmap.addSource('cells', { type: 'geojson', data });
    lmap.addLayer({ id: 'heat', type: 'heatmap', source: 'cells', maxzoom: 15, paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'n'], 0, 0, max, 1],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 30],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.85, 15, 0] } });
    lmap.addLayer({ id: 'dots', type: 'circle', source: 'cells', minzoom: 13, paint: {
      'circle-color': accent, 'circle-opacity': 0.7, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
      'circle-radius': ['interpolate', ['linear'], ['get', 'n'], 1, 6, max, 18] } });
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
    lmap.on('mousemove', 'dots', (e) => { popup.setLngLat(e.lngLat).setText(fmt.format(e.features[0].properties.n) + ' kayıt').addTo(lmap); });
    lmap.on('mouseleave', 'dots', () => popup.remove());
  } else {
    lmap.getSource('cells').setData(data);
    lmap.setPaintProperty('heat', 'heatmap-weight', ['interpolate', ['linear'], ['get', 'n'], 0, 0, max, 1]);
    lmap.setPaintProperty('dots', 'circle-radius', ['interpolate', ['linear'], ['get', 'n'], 1, 6, max, 18]);
  }
  lmap.resize();
  if (d.cells.length) {
    const b = new maplibregl.LngLatBounds();
    for (const c of d.cells.slice(0, 500)) b.extend([c.lon, c.lat]);
    lmap.fitBounds(b, { maxZoom: 14, padding: 30, duration: 0 });
  }
  table($('celltable'), ['Hücre', 'Kayıt', ''], d.cells.slice(0, 100).map((c) => el('tr', null,
    td(c.lat.toFixed(3) + ', ' + c.lon.toFixed(3), 'mono'), td(fmt.format(c.n), 'num'),
    el('td', null, el('a', { href: 'https://www.openstreetmap.org/?mlat=' + c.lat + '&mlon=' + c.lon + '#map=17/' + c.lat + '/' + c.lon, target: '_blank', rel: 'noreferrer', text: 'Haritada aç' })))));
}

const loaders = { overview: loadOverview, map: loadMap, visitors: loadVisitors, feed: loadFeed, alltime: loadAllTime };
function load() {
  document.querySelector('.tab.on .err')?.remove();
  loaders[state.tab]().catch((e) => {
    const msg = e.message === '403' ? 'Erişim yok.' : 'Veri alınamadı (' + e.message + '). Biraz sonra yeniden denenecek.';
    const tab = document.querySelector('.tab.on');
    tab.querySelector('.err')?.remove();
    tab.prepend(el('div', { class: 'card empty err', text: msg }));
  });
}
function switchTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of document.querySelectorAll('.tab')) s.classList.toggle('on', s.id === tab);
  $('range').style.visibility = tab === 'feed' || tab === 'alltime' ? 'hidden' : 'visible';
  load();
}
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => switchTab(b.dataset.tab));
for (const b of document.querySelectorAll('.range button')) b.addEventListener('click', () => {
  state.days = Number(b.dataset.days);
  for (const x of document.querySelectorAll('.range button')) x.classList.toggle('on', x === b);
  load();
});
$('vsearch').addEventListener('input', () => { clearTimeout(vTimer); vTimer = setTimeout(loadVisitors, 300); });
setInterval(() => { if (state.tab === 'feed' || state.tab === 'overview') load(); }, 15000);
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.tab === 'overview' || state.tab === 'alltime') load(); }, 200); });
load();
`
