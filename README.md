# JnQ Journey

JnQ Journey is a Next.js 14 App Router travel map and content system for spots, regions, longform notes, guides, affiliate links, and an authenticated admin workflow.

## Stack

- Next.js 14 App Router
- Supabase Auth, database, and Storage-backed editorial data
- Cloudflare R2 for active image uploads
- Mapbox for the public map
- Vercel Analytics and Speed Insights

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For a production-style local check:

```bash
npm run build
npm run start
```

## Required Environment

Copy `.env.example` to `.env.local` and fill the values.

Important deployment notes:

- `ADMIN_EMAILS` is required. If it is missing, admin API requests are rejected by default.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it as a public env var.
- R2 uploads require the full `R2_*` set plus `R2_PUBLIC_BASE_URL`.
- The public map requires `NEXT_PUBLIC_MAPBOX_TOKEN`; the token should be domain-restricted in Mapbox.

## Content Sources

- Public spots and regions are read from Supabase tables.
- Guides are stored in `data/guides.json`.
- Notes can diverge between local `data/notes.json` and Supabase Storage. The live source may be the Storage payload under `_system/notes` plus the latest-pointer object. Verify the Storage source before treating local JSON as production truth.
- Active admin image uploads should go through `/api/upload/r2` and save Cloudflare R2 URLs.

## Useful Commands

```bash
npm run build
npm run lint
npm run audit:locations
npm run fix:locations
npm run fix:locations -- --apply
npm run import:locations -- ./data/locations-template.csv
npm run import:youtube:gemini -- "https://youtu.be/example"
npm run migrate:images:r2
```

## Verification Checklist

Before deploying meaningful changes:

1. Run `npm run build`.
2. Confirm required env vars exist in Vercel, especially `ADMIN_EMAILS`, Supabase, R2, and Mapbox.
3. Spot-check `/`, `/sitemap.xml`, one `/spot/[slug]`, one `/guide/[slug]`, and one `/notes/[slug]`.
4. For media changes, verify saved database fields contain R2 URLs, not only that the upload response succeeded.
5. For note publishing, verify both local JSON and the Supabase Storage latest pointer when applicable.

## Safety Rules

- Do not commit `.env.local`.
- Preview bulk import or cleanup scripts before using `--apply`.
- Avoid broad rewrites of Unicode-heavy JSON through shell pipelines; use UTF-8-safe tools.
- Keep unrelated dirty `data/*.json` changes separate from code optimization work.
