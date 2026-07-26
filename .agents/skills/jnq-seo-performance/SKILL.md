---
name: jnq-seo-performance
description: Audit and optimize SEO semantics, structured data, responsive media, Mapbox, YouTube loading, and build health for JnQ Journey pages. Use when Guide templates or public pages change metadata, headings, images, maps, embeds, rendering boundaries, or performance; do not alter itinerary facts or visual art direction.
---

# JnQ SEO Performance

Keep public JnQ pages crawlable, semantically correct, stable, and lightweight without converting server-rendered content into unnecessary client code.

## Inputs

- Target route and reusable page template.
- Metadata and canonical builders.
- Structured-data output.
- Image, Mapbox, and video components.
- Existing package scripts.

## Audit and implementation

1. Preserve exactly one meaningful H1.
2. Use H2 for major Guide sections and H3 for individual days or subsection titles.
3. Preserve canonical URL and validate metadata title, description, Open Graph image, and sitemap inclusion.
4. Preserve valid Article, BreadcrumbList, and author schema; do not invent FAQ or Offer data.
5. Require accurate image alt text and responsive `sizes`.
6. Give only the Hero image priority; lazy-load non-critical images.
7. Give media a fixed aspect ratio or dimensions to prevent layout shift.
8. Dynamically import Mapbox and retain attribution plus a readable text fallback.
9. Render YouTube thumbnails first and load privacy-enhanced iframes only after a user click.
10. Keep main narrative and headings server-rendered. Isolate only interactive islands as client components.
11. Avoid new large dependencies unless the user explicitly approves them.

## Verification

Run the repository's existing `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Inspect the built route for canonical, metadata, schemas, heading count, image attributes, iframe loading behavior, and hydration warnings.

## Output

Report SEO and heading findings; metadata, canonical, schema, and sitemap status; image, Mapbox, YouTube, layout-shift, and server/client-boundary status; exact lint, TypeScript, and build results; and remaining runtime-measurement risks.

## Responsibility boundary

Do not rewrite dates, places, budgets, stays, transport, prices, or personal experience. Do not lead visual styling or broad browser regression; use `jnq-guide-design` and `jnq-browser-qa`.

## Safety

Do not read or output `.env.local`, credentials, tokens, or private user data. Do not install dependencies, run destructive commands, change production data, commit, or push unless the user explicitly requests those actions in the current task.
