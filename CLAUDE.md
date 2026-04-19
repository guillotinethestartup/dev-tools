# GTV (Guillotine) — Platform Overview

Independent film & episodic content platform. Three repos, one `make gtv` to run them all.

## Stack

| Repo | What | Tech | Port (dev) |
|------|------|------|------------|
| `gtv-frontend` | Web + mobile apps | Next.js 15, Expo/React Native, React 19, TailwindCSS 4 | 3000 |
| `gtv-backend` | REST API | FastAPI, Python, Uvicorn | 5001 |
| `dev-tools` | Orchestration + dev chat | Makefile, Claude bridge (FastAPI/WS), React widget | 9100 |

## External Services

- **Supabase** — Auth (JWT) + PostgreSQL database. Used by both frontend and backend.
- **Stripe** — Payments + Stripe Connect for creator payouts. Backend handles webhooks.
- **Bunny CDN** — Video streaming via HLS. Token-authenticated pull zone.
- **Railway** — Backend auto-deploys on push to `main`.

## How They Connect

- Frontend calls backend REST API (`/series`, `/episodes`, `/profiles`, `/stripe`, etc.)
- Both frontend and backend authenticate users via Supabase JWT
- Frontend streams video from Bunny CDN via HLS.js
- Dev widget (dev-only) connects to Claude bridge via WebSocket

## Repo Structure

### gtv-frontend (monorepo, npm workspaces + Turbo)
```
apps/web/          — Next.js web app
apps/mobile/       — Expo/React Native app
packages/shared/   — Supabase client, auth hooks, shared services
```

### gtv-backend
```
app/               — FastAPI app, dependencies, schemas
routes/            — API routes (series, episodes, profiles, stripe, videos, events)
database/          — DB repositories + SQL migrations
utils/             — Auth, Bunny CDN, Stripe helpers
tests/             — pytest suite
```
See `gtv-backend/CLAUDE.md` for detailed backend conventions.

### dev-tools
```
Makefile           — make gtv: clone repos, install deps, start all services
claude-bridge/     — WebSocket server bridging browser to persistent Claude CLI process
claude-widget/     — React chat widget, installed into frontend in dev mode only
```

## Development

```sh
cd dev-tools && make gtv
```

Clones frontend/backend if missing, installs everything, starts all three services.

Requires `.env` files — see README.md for details.

## Deploy

1. Run database migrations in Supabase SQL editor
2. Push backend to `main` (Railway auto-deploys)
3. Verify backend is live (`/docs`)
4. Regenerate frontend types: `npm run generate-types` in gtv-frontend (fetches OpenAPI spec from production)
5. Push frontend
