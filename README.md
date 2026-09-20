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
- Administrator account, review-queue, publication, and catalog controls
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

Approved Publishers can build drafts, upload app files and custom icons, create galleries from 3–10 screenshots, and submit listings or versioned updates for review. Administrators can moderate those submissions and manage every public listing. Server-created listings are stored in `data/apps.json`; users and sessions use `data/users.json` and `data/sessions.json`; uploaded files are stored under `data/uploads/`. These runtime paths are ignored by Git so private account data and large installers are not accidentally committed.

Set `STORE_DATA_DIR` when starting the server if you want runtime data on a mounted persistent volume:

```bash
STORE_DATA_DIR=/path/to/persistent/storage npm start
```

## Commands

```bash
npm run dev        # development server
npm run typecheck  # TypeScript validation
npm run build      # production build
npm run preview    # preview the production build
```

## Stack

React 19, TypeScript, Vite, React Router, Express, Multer, Lucide icons, and locally bundled Nunito Sans Variable typography.
