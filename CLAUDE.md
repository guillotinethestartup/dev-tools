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

## Claude Widget + Bridge Architecture

The dev chat widget gives engineers an in-browser chat interface to Claude CLI while developing. It's a two-part system:

### Bridge (`claude-bridge/server.py`)

FastAPI WebSocket server that manages a persistent Claude CLI subprocess per session.

- Spawns Claude with `--input-format stream-json --output-format stream-json` for bidirectional streaming
- Writes user messages to Claude's stdin, reads responses from stdout, forwards to WebSocket
- Process stays alive between messages — no respawn per turn, full conversation context preserved
- SIGINT cancels the current response without killing the process
- `--resume <session_id>` restarts dead processes with conversation history intact
- Widget UUID → Claude session ID mapping persisted to `data/widget_sessions.json`

### Widget (`claude-widget/`)

React component that renders a floating chat panel in the web app during development.

- Connects to bridge via WebSocket at `ws://localhost:9100`
- Sends user text + optional screenshots (html2canvas), console logs, and server logs as context
- Renders streaming responses with markdown, tool calls (collapsible with JSON input), tool results, and a raw JSON event viewer
- Conversation history loaded from Claude's native `.claude/` JSONL files via bridge HTTP endpoints
- Self-contained styling (own CSS variables in `theme.module.css`), no dependency on host app CSS

### How it ships

- `make gtv` installs the widget into gtv-frontend via `npm install --no-save`
- `DevWidget.tsx` in the web app uses a module-level `process.env.NODE_ENV === 'development'` check
- Webpack evaluates this at compile time — production builds never create a chunk for widget code (zero bytes)
- Without dev-tools present, the widget simply doesn't load — no crash, no errors

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
