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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Updating data

Use **Add component** or **Edit record** in the dashboard. Changes are saved to
the current browser automatically.

Use **Export JSON** to download the current inventory and **Import JSON** to
load a shared copy. This makes it easy to keep the site static while the team
is establishing its workflow. The export can be committed to the repo or used
as the seed for a future API or CMS.

Starter data lives in `app/page.tsx` in `initialComponents`.

## Production check

```bash
npm test
```

The project uses vinext so it can build to a static-friendly Cloudflare Worker
bundle while keeping a Next-compatible React authoring model.
