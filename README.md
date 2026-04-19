# Dev Tools

Local development orchestration for Guillotine V2. One command to install, one command to run.

## Prerequisites

- Node.js 20+
- Python 3.11+
- pip

## Setup

### 1. Backend secrets

Create `gtv-backend/.env` with your credentials (get from Railway dashboard or team):

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

### 2. Install dependencies

```sh
cd dev-tools
make install
```

This installs:
- npm packages for `gtv_web_react` (including the `@guillotine/dev-widget` symlink)
- pip packages for `gtv-backend`
- pip packages for `claude-bridge`

## Running

### Full stack (frontend + backend + Claude bridge)

```sh
make dev
```

| Service        | URL                     |
|----------------|-------------------------|
| Frontend       | http://localhost:5173    |
| Backend API    | http://localhost:5001    |
| Claude Bridge  | ws://localhost:9100      |

The frontend automatically points at the local backend in dev mode (via `.env.development`). The backend runs with `ENVIRONMENT=dev`.

### Individual services

```sh
make dev-web       # frontend only (still talks to local backend)
make dev-backend   # backend only
make dev-bridge    # Claude bridge only
```

### Build, deploy, test

```sh
make build-web       # production build
make deploy-web      # build + railway deploy
make deploy-backend  # railway deploy
make test-backend    # pytest with coverage
```

## Claude Widget

The Claude dev widget (`dev-tools/claude-widget/`) is a React component that provides an in-browser chat interface to Claude CLI. It connects to the bridge server via WebSocket.

- **Dev mode**: auto-loads as a floating button in the bottom-right corner
- **Production builds**: completely stripped (zero bytes in bundle)

The widget is installed as a local npm package (`@guillotine/dev-widget`) via symlink. No manual setup needed beyond `make install`.
