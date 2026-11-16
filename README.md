# Makefun Live

[![make.fun](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/frianowzki/makefun-live/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/frianowzki/makefun-live/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A static, dependency-free frontend for make.fun: a bounty board, bounty detail pages with live
requirements, leaderboards, a hunter directory and hunter profiles. Everything it displays comes
from the public make.fun JSON API at request time — there are no fixtures, no mock data and no
invented numbers. When the API fails, the page says so instead of filling in a story.

## Run

```
node serve.ts --port 8129
```

then open <http://localhost:8129>. The server serves `app/` only (Node 22, standard library, path
traversal refused). No build step is needed to run the app; the browser loads plain ES modules.

## Test

```
node scripts/verify.mjs
```

This starts its own server on a random local port and drives the real app in Chromium via
Playwright at 1280, 768 and 390 px: five routes, layout overflow, live requirement loading,
theme persistence, search, refresh, the skip link, leaderboard counts compared against the same
API response the app requests, avatar fallbacks, fast hash changes, unknown routes, and the
broken-image scan. It exits non-zero if any check fails.

To also regenerate the three JPEG screenshots in `screenshots/`:

```
node scripts/verify.mjs --shots
```

`shots.json` lists the file, route and viewport of each screenshot.

## Reproducible build (single dossier file)

`main.ts` bundles the app and everything needed to judge it into one self-contained HTML document,
without touching `vendor/`. Write results outside the repository with an absolute output directory:

```
node main.ts "C:/Users/me/makefun-evidence"
```

The dossier is byte-for-byte deterministic for a given source tree; the build prints its SHA-256
hash, byte count and API totals.

## Routes

| Route | Page |
| --- | --- |
| `#/` | Bounty board, search and filters |
| `#/bounty/<slug>` | Bounty detail with live requirements (`#load-requirements`) |
| `#/bounty/<slug>/leaderboard` | Leaderboard for a competition |
| `#/hunters` | Hunter directory |
| `#/u/<handle>` | Hunter profile |

Unknown routes render an explicit "not a page here" message rather than 404-ing silently.

## Layout

```
app/          index.html, styles.css, main.js, lib/, views/  (the shipped static site)
serve.ts      local static server for app/
main.ts       deterministic single-file dossier builder
scripts/      verify.mjs  real-browser verification
screenshots/  three 1280x800 JPEGs of the main routes
shots.json    screenshot manifest
.makefun/     public payout address only (owner.json)
vendor/       official starter assets, unmodified
```

`npm run check` runs the verifier. This repository contains no secrets: `.makefun/owner.json`
holds a public payout address only.

## Licence

MIT — see `LICENSE`.
