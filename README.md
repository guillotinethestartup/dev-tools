# Dev Tools

Local development orchestration for Guillotine V2. Clone this repo and run one command to get the full stack running.

## Prerequisites

- Node.js 20+
- Python 3.11+
- pip

## Getting Started

```sh
git clone https://github.com/guillotinethestartup/dev-tools.git
cd dev-tools
make gtv
```

This will:
1. Clone `gtv-frontend` and `gtv-backend` if they don't exist (placed as sibling directories)
2. Install all dependencies
3. Start all services

| Service        | URL                     |
|----------------|-------------------------|
| Frontend       | http://localhost:3000    |
| Backend API    | http://localhost:5001    |
| Claude Bridge  | ws://localhost:9100      |

## Backend Environment

Before running, create `../gtv-backend/.env` with your credentials (get from Railway dashboard or team):

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

The dev chat widget (`claude-widget/`) provides an in-browser chat interface to Claude CLI via the bridge server. It is automatically installed into `gtv-frontend` by `make gtv`.

- **Dev mode**: appears as a floating button in the app
- **Production builds**: completely stripped (zero bytes in bundle)
