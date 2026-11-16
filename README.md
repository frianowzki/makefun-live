[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/frianowzki/makefun-live/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/frianowzki/makefun-live/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# Fieldnotes

A small, original editorial frontend for make.fun’s public competition data. It turns the bounty board into a calm workspace: find a challenge, read its live economics and rules, inspect the leaderboard, and meet the people behind the entries.

## Run it

No framework, build step, dependency, or API key is required. Use Node 22+ and the included server:

    node serve.ts --port 8127

Open http://127.0.0.1:8127. The app reads public GET endpoints at https://make.fun/api. The route map is:

- `#/` — live competition board with search, sorting, deadlines, fees, pots, counts, and cursor pagination.
- `#/bounty/<slug>` — competition detail with live payout distribution, UTC dates, countdown, judging rules, and on-demand requirements.
- `#/bounty/<slug>/leaderboard` — the API’s current per-bounty columns, display strings, units, and ranks.
- `#/hunters` — paid rankings with public record fields.
- `#/u/<handle>` — a public profile and entered competitions.

The UI uses dynamic ES module imports per surface, a small cache with timeout and retry, route generation guards, persisted light/dark theme, keyboard skip navigation, and escaped API content. It never writes to make.fun.

## Make the artifact

The official recorder entrypoint copies the app and screenshots and builds its dossier deterministically:

    MAKEFUN_OUTPUT_DIR=out node main.ts

To run the browser verification suite, use:

    node scripts/verify.mjs

The suite uses the existing Playwright installation when available, serves the app on a random local port, checks the five surfaces at desktop, tablet, and mobile widths, and writes evidence outside this repository.

## License

MIT
