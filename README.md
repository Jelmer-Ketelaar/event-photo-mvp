# EventFrame MVP

EventFrame is a full-stack MVP for private event photo albums with:

- unlimited guest joins by link or QR
- unlimited photo uploads per event
- no guest account requirement
- upload from camera or gallery
- simple film-style filters
- shared live album updates
- organizer controls for pause, delete, and bulk download

## Stack

- `apps/web`: React + Vite frontend wrapped with Capacitor for iOS and Android
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

Web is now meant for laptop testing and admin/debug flows. The primary mobile target is the native iOS/Android app generated from `apps/web`.

## Useful Commands

```bash
npm run typecheck
npm run build
```

## Native iOS + Android

The repo now includes native projects in:

- `apps/web/ios`
- `apps/web/android`

Before syncing or opening the native apps, point the mobile build at a reachable HTTPS API:

```bash
cp apps/web/.env.native.example apps/web/.env.native.local
```

Then set:

```bash
VITE_API_BASE_URL=https://your-worker.your-domain.workers.dev
```

Sync native assets and plugins:

```bash
make native-assets
make native-sync
```

Or sync a single platform:

```bash
make native-sync-ios
make native-sync-android
```

Open the native projects:

```bash
make native-open-ios
make native-open-android
```

Notes:

- laptop web development still uses `apps/web/.env` and defaults to `http://127.0.0.1:8787`
- Android emulators fall back to `http://10.0.2.2:8787` when no native API URL is set
- real devices and App Store / Play Store builds should always use a deployed HTTPS API URL
- change `appId` in [`apps/web/capacitor.config.ts`](/Users/jketelaar/personal/event-photo-mvp/apps/web/capacitor.config.ts) before store submission if you want your own bundle identifier
- app icons, splash assets, signing, store screenshots, and release metadata still need to be finalized before submission

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

## Upload Policy

- no photo-count cap per guest
- no photo-count cap per event
- uploads are only limited by per-file size and storage retention settings
- default per-file upload limit is `5 MB`
- default retention is `30 days` after the event date

## Cloudflare Bindings

The Worker expects:

- one `D1` database bound as `DB`
- one `R2` bucket bound as `EVENT_MEDIA`
- one Durable Object binding named `EVENT_ROOM`

The included `wrangler.toml` already defines the local bindings shape. Replace placeholder database and bucket identifiers before deploying remotely.

## Notes

- The frontend is shared across laptop web testing and native mobile shells.
- On iOS and Android, camera and photo-library access now go through the Capacitor Camera plugin.
- Uploaded images are compressed client-side before upload to keep storage costs low.
