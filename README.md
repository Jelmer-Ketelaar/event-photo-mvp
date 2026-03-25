# GuestFrame MVP

GuestFrame is a full-stack MVP for private event photo albums with:

- unlimited guest joins by link or QR
- no guest account requirement
- upload from camera or gallery
- simple film-style filters
- shared live album updates
- organizer controls for pause, delete, and bulk download

## Stack

- `apps/web`: React + Vite PWA-style frontend
- `apps/api`: Cloudflare Worker + D1 + R2 + Durable Objects
- `packages/shared`: shared types and schemas

## Fast Start

```bash
make start
```

That command will:

- create local env files if they are missing
- apply the local D1 migration
- start the API on `http://127.0.0.1:8787`
- start the frontend on `http://localhost:5173`

To stop the processes started by `make start` from another terminal:

```bash
make stop
```

## Manual Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local env files:

   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/api/.dev.vars.example apps/api/.dev.vars
   ```

3. Apply the local D1 migration:

   ```bash
   npm run db:migrate --workspace @event-photo/api
   ```

4. Start the API:

   ```bash
   npm run dev:api
   ```

5. Start the frontend:

   ```bash
   npm run dev:web
   ```

6. Open `http://localhost:5173`

## Useful Commands

```bash
npm run typecheck
npm run build
```

## Product Scope Included

- event creation with name, date, and description
- guest join by private link
- QR code generation for sharing
- optional nickname per guest session
- camera capture or gallery upload
- five lightweight filters
- shared album feed
- live updates over websockets
- organizer upload toggle
- organizer close event action
- organizer photo deletion
- organizer ZIP download
- scheduled cleanup for expired events

## Cloudflare Bindings

The Worker expects:

- one `D1` database bound as `DB`
- one `R2` bucket bound as `EVENT_MEDIA`
- one Durable Object binding named `EVENT_ROOM`

The included `wrangler.toml` already defines the local bindings shape. Replace placeholder database and bucket identifiers before deploying remotely.

## Notes

- The frontend is intentionally web-first so guests can join instantly without app-store friction.
- For native distribution later, this frontend can be wrapped in Capacitor without changing the product flow.
- Uploaded images are compressed client-side before upload to keep storage costs low.
