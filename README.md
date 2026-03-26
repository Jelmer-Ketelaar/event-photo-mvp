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

## Phone Testing On Local Wi-Fi

Docker is not the right fix for this project. The blocker is not process isolation, it is that your phone cannot reach `localhost` on your Mac. The correct approach is to bind both dev servers to your Mac's LAN IP.

Run:

```bash
make start-phone
```

If automatic LAN IP detection fails, pass it explicitly:

```bash
make start-phone LAN_IP=192.168.1.25
```

That will:

- bind the Worker API to `0.0.0.0:8787`
- bind the Vite frontend to `0.0.0.0:5173`
- point the frontend to `http://<LAN_IP>:8787`
- clean up stale old dev processes before starting, so your phone does not keep using an outdated LAN IP

Then open this URL on your phone while it is on the same Wi-Fi network:

```text
http://<LAN_IP>:5173
```

Notes:

- this is the fastest way to test on a phone browser
- it is suitable for local mobile testing, not for production or public sharing
- `make stop` still stops the processes started by `make start-phone`
- event links created from phone mode now resolve to your LAN URL instead of `localhost`
- if your firewall asks, allow incoming connections for Node / Wrangler

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

## Public Deploy On One Domain

This repo is now prepared to run the website and API on the same Cloudflare Worker domain, so guests, QR codes, the admin dashboard, and the API all live under one public URL.

Production config lives in [`apps/api/wrangler.production.toml`](/Users/jketelaar/personal/event-photo-mvp/apps/api/wrangler.production.toml). It uses Cloudflare static assets for the React app and the Worker for the `/api/*` routes.

Fastest live deploy:

```bash
make live
```

That single command will:

- check Cloudflare auth and open the Wrangler login flow if needed
- create the production D1 database if it does not exist yet
- update [`apps/api/wrangler.production.toml`](/Users/jketelaar/personal/event-photo-mvp/apps/api/wrangler.production.toml) with the real D1 database ID
- create the production R2 bucket if it does not exist yet
- run the remote D1 migrations
- build the frontend
- deploy the Worker with the frontend assets and API on one public URL

If you want to verify everything without deploying yet:

```bash
make live-dry-run
```

Manual deploy flow if you want more control:

1. Create a production D1 database:

   ```bash
   npx wrangler d1 create event-photo-db
   ```

2. Create a production R2 bucket:

   ```bash
   npx wrangler r2 bucket create eventframe-media-production
   ```

3. Put the returned D1 database ID into [`apps/api/wrangler.production.toml`](/Users/jketelaar/personal/event-photo-mvp/apps/api/wrangler.production.toml).

4. If you want a custom domain, optionally set `PUBLIC_APP_URL` in [`apps/api/wrangler.production.toml`](/Users/jketelaar/personal/event-photo-mvp/apps/api/wrangler.production.toml) to that final HTTPS URL.

5. Apply the remote database migration:

   ```bash
   make migrate-remote
   ```

6. Dry-run the full production deploy:

   ```bash
   make deploy-dry-run
   ```

7. Deploy the web app and API together:

   ```bash
   make deploy
   ```

After deployment, the site and API run together on one public Worker URL. The frontend will automatically use same-origin `/api/*` requests when it is not running on the local Vite dev server.

Notes:

- local laptop development still uses the separate Vite + Wrangler setup
- phone QR codes and share links now use the active public/LAN origin instead of falling back to `localhost`
- if you bind a custom domain to the Worker, that same domain becomes the guest site, admin site, and API host

## Auto Deploy On Push To `main`

This repo now includes a GitHub Actions workflow in [deploy-main.yml](/Users/jketelaar/personal/event-photo-mvp/.github/workflows/deploy-main.yml). Every push to `main` will:

- install dependencies
- run `npm run typecheck`
- run `npm run test`
- apply remote D1 migrations
- deploy the Worker and web assets

Before it can work, add these repository secrets in GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Recommended Cloudflare API token scopes are documented in the official Cloudflare Workers GitHub Actions docs:
- account read
- workers write
- d1 write
- r2 write

Once those two secrets are present, every push to `main` updates the live site automatically.

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
