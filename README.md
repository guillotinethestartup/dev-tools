# Dev Tools

Local development orchestration for Guillotine V2. Clone this repo and run one command to get the full stack running.

## Prerequisites

- Node.js 20+
- Python 3.13 (installed automatically via `uv` if missing)
- Claude CLI (`claude`) on your `PATH` — required by the dev chat widget

`uv` is installed automatically on first run.

## Getting Started

```sh
git clone https://github.com/guillotinethestartup/dev-tools.git
cd dev-tools
make gtv-local
```

This will:
1. Clone `gtv-frontend` and `gtv-backend` as sibling directories if missing
2. Create a Python venv (`.venv`) and install bridge + backend dependencies
3. Build the Claude widget and install it into `gtv-frontend` (`npm install --no-save`)
4. Start frontend, backend, and the Claude bridge

| Service        | URL                      |
|----------------|--------------------------|
| Frontend       | http://localhost:3000    |
| Backend API    | http://localhost:5001    |
| Claude Bridge  | http://localhost:9100    |

### Run against staging backend

```sh
make gtv-staging
```

Starts frontend + bridge locally but points the frontend at `gtv-backend-staging.up.railway.app` and streams backend logs from Railway (requires the Railway CLI and a linked project).

## Environment Files

### Frontend (`../gtv-frontend/apps/web/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:5001
```

### Backend (`../gtv-backend/.env`)

Get credentials from Railway dashboard or team:

```
SUPABASE_PROJECT_ID=...
SUPABASE_SERVICE_ROLE_KEY=...
BUNNY_API_KEY=...
BUNNY_LIBRARY_ID=...
BUNNY_PULL_ZONE=...
BUNNY_TOKEN_AUTH_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_CONNECT_WEBHOOK_SECRET=...
```

## Claude Widget

The dev chat widget (`claude-widget/`) provides an in-browser chat interface to Claude CLI via the bridge server. `make gtv-local` builds it and installs it into `gtv-frontend`.

- **Dev mode**: floating button in the app; selection chips, screenshots, console/server logs, git status, and raw event stream all attachable to messages
- **Production builds**: completely stripped (zero bytes in bundle)
- **Isolated styling**: rendered inside a shadow DOM with its own adopted stylesheet, so host app CSS can't leak in
