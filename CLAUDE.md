# GTV (Guillotine) — Platform Overview

Independent film & episodic content platform. Three repos, one `make gtv-local` to run them all (or `make gtv-staging` to run the frontend + bridge locally against the Railway staging backend).

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
Makefile           — make gtv-local / gtv-staging: clone repos, install deps, start services
claude-bridge/     — FastAPI + WebSocket server wrapping a persistent Claude CLI process
claude-widget/     — React chat widget, built as a standalone bundle and installed into frontend in dev mode only
```

## Claude Widget + Bridge Architecture

The dev chat widget gives engineers an in-browser chat interface to Claude CLI while developing. It's a two-part system.

### Bridge (`claude-bridge/server.py`)

FastAPI app that exposes a WebSocket for chat plus HTTP endpoints for context lookups. It manages a persistent Claude CLI subprocess per session.

- Spawns Claude with `--input-format stream-json --output-format stream-json` for bidirectional streaming
- Writes user messages to stdin, reads responses from stdout, forwards to the WebSocket
- Process stays alive between messages — no respawn per turn, full conversation context preserved
- SIGINT cancels the current response without killing the process
- `--resume <session_id>` restarts dead processes with conversation history intact
- Widget UUID → Claude session ID mapping persisted to `data/widget_sessions.json`
- Tails the local backend uvicorn log (via `BACKEND_LOG_FILE`) in `gtv-local` mode, or streams Railway logs in `gtv-staging` mode, and forwards lines over the WebSocket
- Injects `claude-bridge/app_context.md` as the widget's system prompt so Claude knows it's running inside the dev chat

HTTP endpoints used by the widget:

| Path                         | Purpose                                             |
|------------------------------|-----------------------------------------------------|
| `WS /`                       | Chat stream (user messages in, Claude events out)   |
| `GET /health`                | Liveness check                                      |
| `GET /widget-session/{id}`   | Look up the Claude session ID for a widget UUID     |
| `GET /conversations`         | List recent conversations with previews             |
| `GET /conversations/{id}`    | Load a conversation's messages from Claude's JSONL  |
| `GET /git/status`            | Git status across `gtv-frontend`, `gtv-backend`, `dev-tools` |
| `GET /git/diff`              | Diff for a single file in one of the repos          |
| `GET /files/{filepath}`      | Read a file from one of the repos                   |
| `GET /logs`                  | Recent backend server log lines                     |
| `* /cache/{key}`             | Tiny key/value store used by the widget for transient state |

### Widget (`claude-widget/`)

React component that renders a floating chat panel in the web app during development. Built with Vite as a library bundle and consumed by `gtv-frontend` via `npm install --no-save`.

Runtime composition (`src/`):

- `DevChatWidget.tsx` — FAB + error boundary entry point
- `DevChatPane.tsx` — pane shell: layout, resize, side-panel orchestration
- `ChatHeader.tsx`, `ChatMessages.tsx`, `ContextBar.tsx`, `InputBar.tsx` — the chat column
- `LogPanel.tsx` — console / server / raw-event log panes (discriminated union)
- `GitPanel.tsx` + `useGitStatus.ts` — git status list + split diff view
- `ScreenshotPanel.tsx` + `useScreenshot.ts` — html2canvas capture with region crop
- `SelectionOverlay.tsx` + `useTextSelection.ts` — cross-panel text-selection popover that turns any highlighted text (logs, diffs, raw events) into a chip that's prepended to the next message
- `ShadowRoot.tsx` — shadow DOM host so host app CSS can't leak in
- `useDevChat.ts`, `useDevWebSocket.ts`, `useConsoleCapture.ts`, `useServerLogs.ts`, `useRawEvents.ts` — state + transport hooks

Rendering:

- Connects to the bridge via WebSocket at `ws://localhost:9100`
- Sends user text plus opt-in attachments: screenshots, console logs, server logs, current page URL, and selection chips
- Streams assistant output with markdown, collapsible tool-call groups (name + JSON input + output), and a raw JSON event viewer
- Conversation history loaded from Claude's native `.claude/` JSONL files via bridge HTTP endpoints
- Self-contained theme in `theme.module.css`; CSS modules scoped to `dw_[local]`; the vite `cssInjectPlugin` inlines CSS into the JS bundle so a single `npm install` is enough

### How it ships

- `make gtv-local` runs `vite build` in `claude-widget/` and then `npm install --no-save claude-widget` in `gtv-frontend`
- The frontend's `DevWidget.tsx` guards the import with `process.env.NODE_ENV === 'development'`
- Webpack evaluates the guard at compile time — production builds never create a chunk for widget code (zero bytes)
- Without `dev-tools` present the widget simply doesn't load — no crash, no errors

## Development

```sh
cd dev-tools && make gtv-local
```

Clones frontend/backend if missing, creates the venv, installs everything, builds the widget, and starts all services. Requires `.env` files — see `README.md`.

Ports: 3000 (frontend), 5001 (backend), 9100 (bridge).

## Deploy

- `dev-tools` is developer-only and doesn't deploy
- Frontend/backend: merging a PR to `staging` auto-deploys to staging; merging to `main` auto-deploys to production
