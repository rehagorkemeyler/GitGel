# GitGel

İstanbul için ücretsiz, reklamsız, üyeliksiz ve açık kaynak toplu taşıma uygulaması.
Free, ad-free, account-free and open-source public transit app for Istanbul.

## Türkçe

Uygulamayı aç, "Nereye?" yaz, rotayı gör. Metro, Marmaray, tramvay, füniküler, teleferik, metrobüs, otobüs ve vapuru tek yerde toplar. Canlı veriyi "canlı", tarifeden hesaplananı "tarifeye göre" diye dürüstçe işaretler. Konumun telefonunda kalır, kişisel veri toplanmaz.

Ürün vizyonu: [VISION.md](VISION.md). Yol haritası: [TASKS.md](TASKS.md). Veri kaynakları: [docs/research.md](docs/research.md).

## English

Open the app, type "Where to?", see your route. GitGel covers metro, Marmaray, tram, funicular, cable car, Metrobüs, bus and ferry. Live data is labeled "live"; anything computed from timetables is labeled "scheduled". Your location stays on your phone; no personal data is collected.

## Repo layout

| Folder | Content |
|---|---|
| `app/` | PWA frontend (Vite, React, TypeScript, MapLibre) |
| `live/` | Live service (Node.js): İETT vehicle positions, Metro İstanbul status |
| `etl/` | Python ETL that builds a clean Istanbul GTFS and static JSON |
| `infra/` | Docker Compose, server setup, Cloudflare Tunnel config |
| `docs/` | Research, API samples, route tests |

## Data and attribution

İBB Açık Veri (İBB Open Data License), Metro İstanbul, İETT, © OpenStreetMap contributors, OpenFreeMap.

## License

[AGPL-3.0](LICENSE)
