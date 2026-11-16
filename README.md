# make.fun live

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/frianowzki/makefun-live/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/frianowzki/makefun-live/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A small, read-only make.fun frontend for exploring live bounties, payout curves, heterogeneous leaderboard metrics, hunter rankings and public profiles. Plain ES modules and CSS with no framework, build step, external fonts or runtime dependencies.

Live demo: https://makefun-live.vercel.app

`npm run verify` runs real browser acceptance checks and refreshes the three dossier screenshots. Install Playwright as a development dependency and its Chromium browser first (`npm install --no-save playwright && npx playwright install chromium`). Live checks use `APP_URL=https://makefun-live.vercel.app npm run verify`. Test evidence is written outside this repository.

## Run locally

```sh
node serve.ts --port 8125
```

Open http://127.0.0.1:8125. The artifact handoff is:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

The app reads the public `https://make.fun/api` endpoints with GET requests only. The hash routes are `#/` for the board, `#/bounty/<slug>` for a bounty, `#/bounty/<slug>/leaderboard` for its live leaderboard, `#/hunters` for paid rankings, and `#/u/<handle>` for a public profile.

The first load contains the shell, CSS, core helpers and board. Detail, leaderboard and people surfaces are dynamic imports, so their code is fetched only when needed. API responses are cached briefly and invalidated by the refresh control. Navigation uses AbortController so a stale route cannot paint over the current one.

MIT licensed.
