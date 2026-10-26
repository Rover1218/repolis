# Repolis

Repolis turns any public GitHub repo into a holographic 3D city. Each top-level folder is a district, each file is a building, and a building's height is the file's size. A time-lapse replays the repo's history, so you can watch the skyline grow from the first commit to today, then fly around or walk through it.

## Features

- Paste any public GitHub repo link and get its city.
- Time-lapse of up to about 200 history snapshots: buildings rise as files grow, glow when changed, and sink when deleted.
- Orbit from outside or fly in and walk the streets.
- Every city has a shareable link with a skyline preview, plus Copy link and Save image.
- Famous example repos on the front page.

## How it works

1. `GET /api/city/{owner}/{repo}` returns today's city and the head commit SHA, so the skyline shows up quickly.
2. `GET /api/city/{owner}/{repo}/{head}/manifest` returns the snapshot list and the plan for replaying history.
3. `GET /api/city/{owner}/{repo}/{head}/batch/{k}` returns the file changes for each batch of snapshots, loaded in order while the city is already visible.

Results are cached by Vercel's CDN (the head-pinned manifest and batches are immutable) and in the visitor's browser. There is no database. All GitHub calls happen server-side with one token.

## Local setup

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # then set GITHUB_TOKEN
npm run dev
```

`GITHUB_TOKEN` is a fine-grained personal access token with "Public repositories (read-only)" access and no other permissions. It stays on the server and must never be committed.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run unit and integration tests (Vitest) |
| `npm run coverage` | Tests with coverage thresholds (80%) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run warm -- <baseUrl>` | Request every example city on a deployed site to fill the cache |
| `npm run verify:github` | Check GitHub's GraphQL commit cursors against REST pagination (needs `GITHUB_TOKEN`) |

## Deploy

1. Create a private GitHub repo and push this project to it.
2. In Vercel (the free Hobby plan is enough), choose Add New, Project, and import the repo.
3. Set `GITHUB_TOKEN` for both Production and Preview.
4. Deploy.
5. Warm the examples: `npm run warm -- https://<your-production-url>`. The `warm.yml` workflow also does this after each successful Production deployment.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, coverage and the E2E tests on every push and pull request.

## Limits

- Public repos only; there is no sign-in.
- GitHub allows about 5,000 API requests per hour per token. A first, uncached build of a city costs several requests per snapshot, so heavy traffic on uncached repos can run into that budget; cached cities cost nothing.
- Very large repos use a coarse mode with fewer, less precise snapshots.
