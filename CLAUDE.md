# CLAUDE.md: GitGel

GitGel is a free, open-source (AGPL-3.0), ad-free, account-free Istanbul public transit app. Read VISION.md before any product or design decision. Read TASKS.md to see what is next. Read docs/research.md for data-source details.

## Working with Görkem

1. Talk to Görkem in Turkish. Keep code, commits and code comments in English.
2. He is not a full-time developer. When he must do something himself (install Docker, create an Oracle account, click in a web console), give short numbered steps with exact commands to copy and paste, and tell him what output to expect.
3. Work autonomously through TASKS.md in order, from start to finish, without waiting for approval. For each task: finish it, test it (build and tests must pass), check it off in TASKS.md, commit, push, then continue with the next one.
6. When a step needs Görkem (running a command on his machine, clicking in a web console), do not stop. Write a "SENİN SIRAN" section in the chat with copy-paste commands and the expected output, append the same to docs/GORKEM-TODO.md, then move on to the next task that does not depend on him (for example build the UI against mock data while the server is not ready). When he pastes the output, continue from there.
7. After each stage, give a Turkish summary of at most five sentences and keep going without asking.
8. Ask Görkem only about real product or design decisions that VISION.md does not answer.
4. Credits are limited. Do not read huge files in full (GTFS stop_times has millions of rows): use head, wc, sampling and scripts. Do not re-explore what docs/research.md already documents.
5. Before adding any dependency, service or feature, check it against VISION.md "Asla olmayacaklar". If it conflicts, do not do it; tell him why.

## Git workflow

1. No pull requests and no waiting for review. Commit and push directly to `main`.
2. If a push to `main` is rejected, push to your own branch, open a PR and merge it yourself (gh CLI, GitHub MCP tools or the REST API).
3. Never push with failing build or tests.

## Server access

The server is an Oracle Cloud Always Free VM (ARM64, Milan). Görkem connects with `ssh gitgel` (~/.ssh/config, key ~/.ssh/gitgel.key). Claude does not have SSH access: after the one-time setup, server changes ship through the GitHub Actions deploy workflow (.github/workflows/deploy-server.yml), which on every push to `main` SSHes in with a dedicated deploy key stored as repo secrets, runs `git pull` and `docker compose up -d` in the repo's `infra/`. Anything that cannot go through that path goes to Görkem as "SENİN SIRAN". Everything server-side runs in Docker; images must support linux/arm64. Keep only port 22 open; public traffic arrives through Cloudflare Tunnel. Never commit keys, IPs or tokens.

## Architecture

```
Phone (PWA)  ── GitHub Pages: static app + daily-built data files
     │
     ├── OpenFreeMap: map tiles (free, no key; attribution required)
     │
     └── api.gitgel.<domain>  (Cloudflare proxy, free plan, caching)
            └── Server: Oracle Cloud Always Free (Ampere A1 ARM, Ubuntu 24.04), reached via SSH
                  ├── motis   : routing + geocoding (Docker)
                  └── live    : small service; polls İETT + Metro İstanbul, caches, serves JSON
GitHub Actions (nightly): ETL builds clean GTFS + static JSON, publishes to Pages, server pulls new GTFS
```

## Stack

| Part | Choice |
|---|---|
| Frontend | Vite + React + TypeScript, vite-plugin-pwa, MapLibre GL JS |
| Styling | CSS variables for light/dark tokens; no UI framework that fights the design system |
| Routing | MOTIS (MIT), Docker |
| Live service | Node.js (TypeScript), tiny HTTP server, in-memory cache |
| ETL | Python 3 + pandas, run in GitHub Actions |
| Hosting | GitHub Pages (frontend, data), Oracle Always Free VM (motis + live), Cloudflare free plan in front via Cloudflare Tunnel (no inbound ports except SSH) |

## Suggested repo layout

```
/app        frontend (Vite)
/live       live service (Node)
/etl        Python ETL scripts + tests
/infra      docker-compose.yml, server setup notes, cloudflared config
/docs       research.md, api-samples/
/.github/workflows  nightly-etl.yml, deploy-pages.yml
```

## Verified data sources (tested 2026-09-26, no API key needed)

Metro İstanbul REST, base `https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/`:
GetLines, GetStationById/{LineId}, GetServiceStatuses (returns only lines with problems), GetAnnouncements/{tr|en}. GetTimeTable and GetStationBetweenTime are POST with unknown bodies: discover them by trial (curl from Görkem's computer or the server) and save samples to docs/api-samples/. Fallback if not found: build rail schedules from GetLines FirstTime/LastTime plus headway and one-way trip time written in each line's HTML Content, with inter-station times proportional to distance.

İETT SOAP, `https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx`, namespace `http://tempuri.org/`:
GetHatOtoKonum_json(HatKodu) returns kapino, enlem, boylam, hatkodu, guzergahkodu, yon, son_konum_zamani, yakinDurakKodu. GetFiloAracKonum_json() returns the whole fleet without line codes and includes stale records: filter by timestamp. The JSON is a string inside the SOAP envelope. GetFiloDurum_json is not exposed.

Static GTFS: İETT GTFS on data.ibb.gov.tr (current but malformed: truncated stop_times CSV, use the ZIP; semicolon separated; double-encoded UTF-8; coordinates without decimal points; no shapes). The multi-operator GTFS (metro, Marmaray, ferries) is frozen since 2021 to 2023 and misses M11, M12, T5 and extensions: use only as reference. Rail GTFS must be generated from Metro İstanbul API + OSM. Marmaray and M11 are not operated by Metro İstanbul and need separate sources.

Not allowed: Moovit endpoints (metro.istanbul's trip planner embeds moovitapp.com), any private or undocumented third-party API.

License: İBB Open Data License allows commercial and non-commercial reuse with attribution. Show attributions for İBB Açık Veri, Metro İstanbul, İETT, OpenStreetMap contributors, OpenFreeMap.

## Product rules the code must respect

1. Never show a modal or popup the user did not open.
2. Live data is labeled live; anything computed from schedules is labeled "tarifeye göre" and drawn as a hollow dot. If GetServiceStatuses reports a problem on a line, hide its schedule-based dots and show the notice.
3. No analytics that identify users. No third-party trackers. Recent searches live in localStorage only.
4. The app must work on low-end Android: no backdrop-filter, animate only transform and opacity, respect prefers-reduced-motion.
5. Every data source can go down. Cache last good responses and degrade gracefully with a clear, calm message.

## Test trips (must all return a sensible route)

| From | To | Expected core |
|---|---|---|
| Yenikapı | Ayrılık Çeşmesi | Marmaray, no transfer |
| Kadıköy | Alibeyköy | M4, transfers, M7 or T5 |
| Taksim | Sabiha Gökçen Havalimanı | M2 + Marmaray/M4 |
| İstanbul Havalimanı | Kadıköy | M11 + Marmaray or ferry |
| Üsküdar | Beşiktaş | Ferry |
| Kabataş | Bağcılar | T1, no transfer |
| Eminönü | Eyüpsultan | T5 |
| Hacıosman | Yenikapı | M2, no transfer |
| Mecidiyeköy | Ümraniye | Metrobüs/M5 combination |
| Bakırköy | Levent | M1A/Marmaray + M2 or metrobüs |
