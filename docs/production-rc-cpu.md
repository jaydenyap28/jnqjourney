# Production CPU release candidate — not approved for deployment

## Frozen sources

- Formal baseline: `bd656882c4eb13ad8a0a372ec84daf6100f4d608` (fetched origin/main).
- Deployed Production: `85d47509ae25fa622f3c246afc555cd19849b549`, an ancestor of the formal baseline.
- Frozen Preview evidence: `fda15672322ac673326cc2cfa6561b594f869471`; local annotated tag `evidence/preview-fda1567`.
- Preview deployment: `dpl_89fRsY371mwTEZphTxSzjPeDtMAy`, READY, https://jnqjourney-omdbxwhq7-jayden-yaps-projects.vercel.app .
- CPU source: `3213b38cbd0ff4a7cb5c54dc25c4a73e5be982d5`. Its merge base with main is `b1cbd308f6b4871f0240a092ba312937b92131e6`; main and that candidate have 333 and 14 unique commits respectively. This RC is based on main and ports the applicable CPU changes; it does not merge the Preview branch or claim to inherit the original CPU SHA.
- Pages server-boundary source: `2b68bebb29594264f55d3a6a81ce505f36b4c083`.
- Storage timeout/API compatibility source: `fda15672322ac673326cc2cfa6561b594f869471`.

## Included and preserved

Package middleware calls an Edge-safe visibility helper directly and selects only the live published ID. The main baseline's verified published package backup remains available on upstream failure; an authoritative empty live result returns 404. Unknown or malformed results return 503. Hainan editorial hubs, nested package routes and legacy redirects remain intact.

Spot middleware makes one routing API request instead of routing plus full-gallery API calls. Spot aliases share one ID cache, and quality is calculated with the cached payload. The live routing/hidden/redirect gate runs before serving cached HTML; current-source failures now fail closed instead of falling back to a frozen publication list. Public detail JSON uses the same gate and no-store HTTP responses while retaining its server payload cache. The existing `public-spots` publication tag remains on ID entries so main's publishing handlers still invalidate them. See spot-live-guard.md for current behavior and the outstanding R2 owner check.

Guide/Note selectors reuse the bounded collection cache and render memoization. Failed configured CDN collection reads escape rather than caching an obsolete fallback as success. Generic package details use 3600-second ISR; main's package and option handlers now invalidate that route after successful writes. Public slug resolution is shared, and slug edits invalidate its tag and related data/sitemap entries.

The verified public fallback `public-data/fallback/2026-10-30.json` is copied from the CPU candidate without content edits. Its withdrawal and eligibility validation, error reset and rollback switch remain. ID 450 is blocked in the resolver, routing, English static paths and sitemap inventory. Static Spot fallback responses stay noindex. The App fallback entry retains `server-only`; Pages data functions dynamically import Node readers only in `getStaticPaths`/`getStaticProps`.

All formal font definitions, Mapbox, WhatsApp, English route rendering, specialty package templates, analytics/admin features and main's package/routing snapshots remain. Targeted tests compare key implementations byte-for-byte with the pinned formal baseline. The RC contains no runtime Preview project identity, synthetic fixture provider, system font override, Preview CSP/noindex blanket, or Preview-only feature disablement. Existing formal image/SEO settings are retained.

## Local validation

- Node 24.13.0; fresh `npm ci` from the unchanged main lockfile. Next 14.2.35; Supabase JS and Storage both 2.93.3. No SDK upgrades.
- TypeScript and lint of changed files passed. The full build also reached a successful Webpack/type/lint phase on its first attempt, with existing main warnings.
- 19 relevant test cases passed across the Storage and RC suites. Real loopback HTTP tests prove cancellation at about four seconds for stalled headers and stalled bodies; no Promise.race substitute is used for Storage cancellation.
- Deterministic work counts: two Spot aliases require one CDN index + one detail read and one quality evaluation; a publication invalidation causes a fresh read. Multiple Guide selections share one collection GET. Package middleware performs zero internal HTTP self-requests. A Spot middleware invocation performs one internal routing request.
- No Production dotenv or credentials were loaded. Child environment was allowlisted. Verification network allowed only actual GET/HEAD Google font downloads and loopback traffic; production/database/external-write requests were blocked. The first build lacked client public Supabase configuration. The second used only non-routable public placeholders in the verification process. Those values are absent from committed runtime source; these local artifacts must never be deployed.

## Build history and remaining evidence gaps

The initial RC preparation made two unsuccessful build attempts, recorded below. The font-only follow-up now passes a final isolated Production-mode build (79/79 pages, zero Google Fonts requests); see site-fonts.md for assets, licenses, coverage and sizes. No deployment was triggered.

1. With no Supabase public values at all, Webpack and type checks passed and 79 static generation tasks ran, but 11 admin routes failed because main's browser client requires a Supabase URL at module initialization (`supabaseUrl is required`). This is a local verification configuration prerequisite, not a reason to load Production secrets.
2. After supplying only local verification placeholders, Next's Google font loader failed in both `app/layout.tsx` and `pages/_app.tsx`: `TypeError: Cannot read properties of null (reading '1')` at `next/dist/compiled/@next/font/dist/google/loader.js:112`. The loader executes `/\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1]`. Actual Google responses included `/l/font?...` addresses without a terminal extension. No font responses were mocked and no formal font definition was changed. This font compatibility blocker is now resolved with same-family local WOFF2 resources and a successful final clean build.

One targeted browser network-capture attempt was made against the frozen Preview. Activating the target for native DevTools was blocked by the window's user-input protection. No retry, protection downgrade or persistent bypass credential was used. A complete browser request trace remains missing; the Preview's prior HTTP/CSP/robots checks do not prove this separate formal RC's runtime network behavior.

Production Fluid billed CPU, cold-start cost of verified backups, live source freshness, real publication refresh and third-party integrations cannot be established by local build timings. The main baseline's specialized package routes remain dynamic. Existing lint/large-English-home-payload warnings were recorded without unrelated refactoring. The formal build requirement is now satisfied. Explicit release approval and the remaining runtime/evidence checks still apply; the local placeholder-configured artifact must never be deployed.
