# Local — custom apps store

A polished, responsive storefront for showcasing downloadable desktop/mobile apps and browser-based tools.

## What is included

- Discovery homepage with a featured app and curated collections
- Search dialog with `Cmd/Ctrl + K`
- Catalog search, category filters, platform filters, and sorting
- Detailed app pages with screenshots, release notes, versions, and platform details
- Download flows for desktop/mobile listings and direct launch for web apps
- Guest browsing with a three-action lifetime allowance for downloads/web-app opens
- Sign-in and reviewed registration requests for Member and Publisher accounts
- Role-aware personal, publisher, and administrator workspaces
- Favorites and a downloaded-app library, persisted in `localStorage` for approved accounts
- Draft → review → approval publishing, including reviewed listing edits and releases
- Approved public snapshots that stay live while later revisions await moderation
- Administrator account, submission/review moderation, publication, editorial, trust, and recovery controls
- SQLite-backed users, sessions, listings, reviews, analytics, audits, subscriptions, and backup snapshots
- Real-time Server-Sent Events for notifications and automatic catalog/workspace refreshes
- Email verification, one-time password recovery, session revocation, and notification preferences
- Verified-use ratings and reviews with helpful votes, Publisher replies, reports, and deliberate moderation
- Stable, beta, and preview release channels with scheduling, deterministic staged rollouts, and subscriptions
- Public Publisher profiles, follower relationships, support links, and Administrator-managed verification
- Privacy-conscious aggregate analytics with rotating anonymous identifiers, 90-day retention, and Do Not Track support
- Browser-local personalized discovery plus Administrator-curated editorial collections
- SHA-256 integrity records, focused local build validation, signatures, and permission disclosures
- Direct installer uploads (up to 2 GB) or external download URLs
- Screenshot galleries with 3–10 uploaded images or image URLs
- Custom icon uploads with built-in icon fallbacks
- Update management with versioned files, release notes, and downloadable history
- Permanent repo-backed starter catalog in `public/apps.json`
- Loading, empty, error, offline, not-found, confirmation, upload, and toast states
- Responsive desktop/mobile navigation
- Light and dark themes
- Accessible focus states and reduced-motion support

## Run locally

Node.js 22.5 or newer is required for the built-in SQLite API.

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:5173` by default.

The temporary bootstrap administrator is:

```text
Username: admin
Password: admin123
```

The bootstrap credentials are intentionally temporary; replace the bootstrap configuration before using the store outside a local development environment. New Member and Publisher registrations remain browse-only until an administrator approves them.

## Add a permanent app

1. Add a listing to [`public/apps.json`](public/apps.json).
2. For a downloadable app, put the installer/archive in `public/downloads/` and use a value such as:

   ```json
   "delivery": "download",
   "downloadUrl": "/downloads/my-app.zip"
   ```

3. For a web app, use:

   ```json
   "delivery": "web",
   "webUrl": "https://my-app.example"
   ```

4. Add optional artwork to `public/art/` and reference it from `screenshots`.

Approved and email-verified Publishers can build drafts, upload app files and custom icons, create galleries from 3–10 screenshots, manage Publisher branding, and submit listings or channel-based updates for review. Administrators can moderate those submissions and manage every public listing.

Runtime state is stored in `data/store.sqlite` using Node's built-in SQLite module. On first launch, legacy `data/apps.json`, `data/users.json`, and `data/sessions.json` documents are imported automatically when present. Uploaded files remain under `data/uploads/`, while Administrator-created JSON recovery points are written under `data/backups/`. These runtime paths are ignored by Git so private account data and large installers are not accidentally committed.

Set `STORE_DATA_DIR` when starting the server if you want runtime data on a mounted persistent volume:

```bash
STORE_DATA_DIR=/path/to/persistent/storage npm start
```

Optional runtime settings:

```bash
PORT=5173                         # HTTP port
ANALYTICS_RETENTION_DAYS=90       # automatic aggregate-event retention
ANALYTICS_SALT=replace-me         # deployment-specific anonymous-ID salt
NODE_ENV=production               # serve the built Vite application
```

Email delivery intentionally uses a local outbox/preview adapter in this foundation. Registration and recovery responses expose a local action link so the complete flow can be tested without third-party credentials. Replace that adapter before an internet-facing deployment. Likewise, the focused local validator records checksums and obvious unsafe patterns but is not a substitute for a full malware-scanning service.

Use the Administrator **System** page to create a consistent backup before upgrades. Restoring a backup first creates a safety backup and then revokes every session.

## Commands

```bash
npm run dev        # development server
npm run typecheck  # TypeScript validation
npm run build      # production build
npm run preview    # preview the production build
```

## Stack

React 19, TypeScript, Vite, React Router, Express, Multer, Node SQLite, Server-Sent Events, Lucide icons, and locally bundled Nunito Sans Variable typography.
