# Performance

Measured with headless Chromium, 360x740 viewport, CPU throttled 4x (low-end Android), 150 ms latency and ~6 Mbit/s download, local MOTIS. Script: open app, tap "Nereye?", type "kadikoy", pick the first result, wait for route cards (typing included).

| Build | UI ready | Search result | Route cards | Repeat visit UI |
|---|---|---|---|---|
| 2026-09-26, single bundle | 1.54 s | 3.56 s | 4.72 s | 1.23 s |
| 2026-09-26, map lazy-loaded + search index prefetched on idle | 0.78 s | 2.72 s | 3.46 s | 0.45 s |

Rules checked in code: animations use only transform and opacity (bottom sheet, panel entry); no backdrop-filter; prefers-reduced-motion sets durations to 0 and disables map fades; touch targets at least 44 px.

Still to do on a real low-end Android phone (Görkem): open the Pages URL, add to home screen, time "open → route" by hand.
