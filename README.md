# Maple Component Tracker

A lightweight dashboard for tracking the AP News design system’s component
inventory, design readiness, cross-platform support, and adoption across web,
iOS, and Android.

## What it tracks

- Component name and system layer: Base, Slot, Module, or Page structure
- Variants and design status
- Overall cross-platform support
- Adoption status for web, iOS, and Android
- Dependencies for Slots, Modules, and Page structures
- Figma, documentation, and Jira links
- Notes and last-updated context

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add the Firebase Web App configuration values to `.env.local` before starting
the server. The local environment file is intentionally excluded from Git.

Open [http://localhost:3000](http://localhost:3000).

## Updating data

The dashboard uses Firebase Authentication and Cloud Firestore. Verified
`@ap.org` accounts can view the inventory. Users with a matching document at
`editors/{firebase-auth-uid}` can add, edit, and import component records.

Use **Add component** for manual records or **Import Figma JSON** to merge a
Figma component export. Firestore listeners update every open dashboard when a
record changes.

On a new database, an approved editor can use **Publish starter inventory** to
seed Firestore from the browser's previous local copy or the bundled inventory.
Starter data lives in `app/component-data.ts`.

Firestore rules live in `firestore.rules`. Deploy them before connecting the
production dashboard. Editor documents must be created by an administrator in
the Firebase console because client writes to `editors` are denied.

## Production check

```bash
npm test
```

The project uses vinext so it can build to a static-friendly Cloudflare Worker
bundle while keeping a Next-compatible React authoring model.
