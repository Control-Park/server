[![CI](https://github.com/Control-Park/server/actions/workflows/ci.yml/badge.svg)](https://github.com/Control-Park/server/actions/workflows/ci.yml)

# Control Park Server

Control Park Server is the backend API for the Control Park mobile app. It provides authentication, listings, reservations, payments, notifications, reviews, vehicles, and messaging endpoints, and it also exposes a WebSocket channel for near-real-time in-app updates.

This repository is the server-side companion to the mobile client in [E:/control-park](E:/control-park/README.md).

## Quick Links

- [Jira Board](https://control-park.atlassian.net/jira/software/projects/KAN/boards/1)

## Table of Contents

- Overview
- What the Server Owns
- Tech Stack
- Architecture
- API Surface
- Environment Variables
- Getting Started
- Scripts
- Docker
- Supabase Migrations
- Known Gaps

## Overview

The server acts as the application layer between the Control Park mobile client and the underlying Supabase-backed data model.

At a high level, it is responsible for:

- validating and authenticating client requests
- serving listing and reservation workflows
- handling host and guest messaging
- coordinating payment setup and payment-method storage
- managing notification state and WebSocket delivery
- exposing Swagger API documentation for development

The mobile client lives in [E:/control-park](E:/control-park/README.md) and is expected to point `EXPO_PUBLIC_SERVER_URL` at this server.

## What the Server Owns

Based on the current route structure in [src](E:/server/src), this backend owns:

- `auth` flows for signup, signin, password reset, email change, profile fetch/update, and push token registration
- `listings` flows for fetch, create, draft create, update, delete, report, save/unsave, and host-owned listing queries
- `reservations` flows for booking creation, host review, cancellation, host stats, and booked-range lookups
- `conversations` and message threads
- `payments` flows for Stripe setup intents and saved payment methods
- `notifications` inbox, read state, deletion, and user notification settings
- `reviews` for guest and listing review workflows
- `vehicles` endpoints used by the mobile app
- WebSocket connections authenticated by Supabase access token

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Runtime | Node.js 20+ | Server runtime |
| Framework | Express 5 | HTTP API routing |
| Language | TypeScript | Typed server implementation |
| Auth / data access | Supabase JS | User verification and database access |
| Payments | Stripe | Setup intents and payment method handling |
| Realtime | `ws` | WebSocket notifications over the same port as HTTP |
| API docs | Swagger JSDoc + Swagger UI | Interactive endpoint documentation |
| Tooling | ESLint, Prettier, Husky | Code quality and formatting |

## Architecture

This server is a single Node/Express application with route modules and a shared HTTP/WebSocket server.

```text
+---------------------------+
| Control Park mobile app   |
| Expo / React Native       |
+-------------+-------------+
              |
              | HTTP + Bearer token
              | WebSocket ?token=...
              v
+---------------------------+
| Express API               |
| auth, listings, bookings, |
| messages, payments, etc.  |
+-------------+-------------+
              |
              v
+---------------------------+
| Supabase                  |
| auth verification + data  |
+---------------------------+
              |
              v
+---------------------------+
| Stripe                    |
| setup intents / PMs       |
+---------------------------+
```

### Entry point

The application starts from [src/index.ts](E:/server/src/index.ts), where it:

- configures CORS and JSON body parsing
- mounts the route modules
- generates Swagger docs at `/api-docs`
- creates an HTTP server
- attaches a WebSocket server to the same port

### Authentication model

Protected routes use [src/middleware/auth.ts](E:/server/src/middleware/auth.ts), which verifies the bearer token with Supabase using `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Once verified, the authenticated user is attached to `req.user`.

### Realtime model

The WebSocket server expects a `token` query param. On connection, the server validates that access token through Supabase and registers the socket under the authenticated user ID. Notification helpers can then fan out events to that user’s active sockets.

## API Surface

The main route groups mounted in [src/index.ts](E:/server/src/index.ts) are:

- `/auth`
- `/listings`
- `/notifications`
- `/payments`
- `/conversations`
- `/reservations`
- `/reviews`
- `/vehicles`

Swagger documentation is exposed at:

- [http://localhost:9001/api-docs](http://localhost:9001/api-docs)

When running locally on the default port.

## Environment Variables

The checked-in [.env.example](E:/server/.env.example) currently includes:

```env
CORS_ORIGIN=
DB_PASSWORD=
SUPABASE_URL=
SUPABASE_ACCESS_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
SMTP_KEY=
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
```

However, the current source code also directly references additional variables that are required for some flows:

- `SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `PORT`
- `NODE_ENV`

That means the current `.env.example` is incomplete and should not be treated as the full source of truth yet.

### Recommended local `.env`

```env
PORT=9001
NODE_ENV=development
CORS_ORIGIN=http://localhost:8081

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ACCESS_TOKEN=

STRIPE_SECRET_KEY=

SMTP_KEY=
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
DB_PASSWORD=
```

### Variable notes

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: required by auth middleware for verifying bearer tokens
- `SUPABASE_SERVICE_ROLE_KEY`: server-side Supabase access that bypasses RLS where needed
- `SUPABASE_ACCESS_TOKEN`: used in existing project tooling and migrations
- `STRIPE_SECRET_KEY`: required by payments and reservation payment flows
- `CORS_ORIGIN`: frontend origin allowed to call the API
- `PORT`: defaults to `9001` if omitted

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Supabase project configured for Control Park
- Stripe secret key for payment-related routes

### Local setup

```bash
# 1. Enter the server repo
cd E:/server

# 2. Install dependencies
npm install

# 3. Create local env config
cp .env.example .env

# 4. Fill in the required variables

# 5. Start the dev server
npm run dev
```

The server runs on:

- `http://localhost:9001` by default

And the Swagger docs are available at:

- `http://localhost:9001/api-docs`

### Mobile client integration

The frontend app in [E:/control-park](E:/control-park/README.md) should point:

```env
EXPO_PUBLIC_SERVER_URL=http://localhost:9001
```

At this server during local development.

## Scripts

From [package.json](E:/server/package.json):

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `tsx --watch --conditions development --env-file .env src/index.ts` | Start dev server with watch mode |
| `npm run start` | `node --env-file .env dist/src/index.js` | Start compiled production build |
| `npm run build` | `tsc` | Compile TypeScript output into `dist/` |
| `npm run type-check` | `tsc --noEmit` | Run type checking without output |
| `npm run lint` | `eslint .` | Lint codebase |
| `npm run lint:fix` | `eslint --fix .` | Auto-fix lint issues when possible |
| `npm run format` | `prettier --write .` | Apply formatting |
| `npm run format:check` | `prettier --check .` | Verify formatting |

## Docker

The repository includes a [Dockerfile](E:/server/Dockerfile) for containerized deployment.

### Build

```bash
docker build -t control-park-server .
```

### Run

```bash
docker run -p 9001:9001 --env-file .env control-park-server
```

Once running, the server is reachable at `http://localhost:9001` and the docs at `http://localhost:9001/api-docs`.

## Supabase Migrations

The repo already includes a `supabase/` directory and the contributing guide documents the intended migration workflow.

Typical commands:

```bash
npx supabase init
npx supabase link --project-ref <project-id>
npx supabase migration new <migration_name>
npx supabase db push
```

This keeps schema changes versioned alongside the backend code.

## Known Gaps

These are worth keeping explicit in the documentation:

- The current `.env.example` is missing some variables referenced in source code.
- The top-level backend `README` was previously minimal, so setup knowledge may still live partly in team memory or other docs.
- The server assumes external services such as Supabase and Stripe are configured correctly; there is no fully self-contained local stack documented here yet.

## Related Repositories

- Mobile client: [E:/control-park/README.md](E:/control-park/README.md)
- Backend server: [E:/server/README.md](E:/server/README.md)
- Team board reference: [Jira Board](https://control-park.atlassian.net/jira/software/projects/KAN/boards/1)
