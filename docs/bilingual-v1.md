# Production Bilingual V1

## URL and rendering contract

Chinese public URLs remain at their existing paths, including `/region`. English uses `/en` plus the same entity path and slug. No `/zh`, geo redirect, or preference-based redirect is introduced. The language links preserve the current query and fragment and support keyboard navigation. A preference cookie records an explicit choice but never determines server output.

Chinese continues through the existing App Router (`html lang="zh"`). English uses a Pages Router SSG catch-all with a dedicated document (`html lang="en"`), blocking fallback and 600-second ISR. This avoids moving the existing Chinese/Admin route tree or introducing request-header/cookie reads into static rendering. Language boundaries use full document navigation. The navigation declaration compatibility shim is covered by a test preventing App Router navigation hooks from entering the English client graph.

`lib/locale.ts` provides the shared locale type, route mapping and typed Chinese/English interface dictionary. Entity titles reuse `EntityName` and `resolveEntityDisplayName`: English/original first on English pages; trustworthy Chinese secondary; brands without a trustworthy Chinese name remain a single original name.

## Translation storage and publication

`public-data/i18n/en/records.json` is the bundled, reviewed text overlay. Each record identifies its entity, canonical path, status, source URL/capture time and translated leaf fields with their original source strings. The runtime clones the shared source and applies only allowlisted text fields whose source still matches. It cannot change IDs, relationships, array lengths, order, money, coordinates or media URLs. Opening-hours JSON permits translated remarks while checking that all other fields match.

Publication command (without `--apply` it only validates and prints a manifest):

```powershell
node --env-file=.env.local --experimental-strip-types scripts/publish-localizations.mjs --apply
```

The command writes an immutable authoritative Supabase Storage document, verifies its SHA-256, advances `_system/i18n/en/latest.webp`, then publishes versioned and current JSON snapshots to R2. The `.webp` container/content type follows this project's existing system-document Storage convention; its contents are JSON text, not a new image. Only the new localization namespace is written. Public reads use R2/CDN with the bundled document as fallback and never call PostgREST for translations.

Published initial snapshot: `2026-09-08-v1-57ebff3e992e2fc5`, 72,536 bytes, SHA-256 `57ebff3e992e2fc58a6db797667c5815e8823e9bb459c6c0129e4ac0f2cd7e13`. Authoritative and public read-back hashes matched. Raw entity and media snapshots are shared, not duplicated into this overlay.

## Curated pilot

| Type | Complete records |
| --- | --- |
| Region (5) | Kuala Lumpur, Langkawi, Johor, Kota Kinabalu, Semporna |
| Guide (3) | Langkawi 5D4N; Hokkaido/Yamagata/Tokyo 10D9N; Jiangnan autumn 15D14N |
| Spot (6) | Langkawi Sky Bridge (810), Golden Bamboo Cafe (829), Ningle Terrace (374), Otaru Canal (339), Shanghai Xintiandi (446), The Bund (449) |

Existing Guide itinerary structures, stable spot/accommodation IDs, ordering, MYR costs, dates and media are retained. Langkawi's unassigned structure stays unassigned, with no inferred daily route. Its route map does not connect unassigned points.

Other Region/Guide/Spot pages can render the original body with English interface and an explicit incomplete-translation notice. Directory/search pages remain conservatively partial while their content set is not fully translated. Static policy/contact/notes/packages entry points display a link to the original Chinese page; this pilot does not translate those bodies or their detail routes.

## SEO and cache

Complete pilot pages have self-canonicals and reciprocal `zh`, `en` and `x-default` alternates. Existing Chinese canonicals remain unchanged. The sitemap adds only the 14 pages whose current source still validates as complete. Missing, partial or stale English pages are `noindex,follow` and omitted from the English sitemap; they do not advertise incomplete alternates. New Chinese displayed body text also invalidates completeness; embedded related-region records are assessed separately rather than counted as Spot body text.

English HTML/ISR paths and localization document keys are locale-specific. Raw entity/media snapshot keys are deliberately shared. The reader uses a 60-second in-process cache, 3,600-second CDN/fetch policy and bundled fallback; the English page uses 600-second ISR. Ten warmed requests across English home, Region, Spot, Guide and Search were all `HIT`, with zero outbound fetches and zero live PostgREST queries under the local production server fetch trace. Production platform cache headers are checked after deployment; local tracing is not represented as platform database telemetry.

## Pre-release verification

- 43 targeted tests passed; lint, TypeScript and production build passed.
- 35 HTTP/metadata/payload checks passed, including both languages for all 14 pilot entities and 14 English sitemap URLs.
- `/api/locations`: 457,323 -> 457,323 bytes, byte-identical. `/api/guides`: 4,661 -> 4,661 bytes, byte-identical.
- 644 existing Chinese routes returned 200: 575 Spots, 58 Regions, 7 Guides and four core entries. No `/zh` redirects.
- Browser core-page checks at 390x844, 430x932, 1440x900 and 1920x1080 found no horizontal overflow. All seven Chinese Guides also passed 390/1440 width checks. Search query and Guide query/fragment survived keyboard language round trips.
- English Japan map rendered; video iframe count changed from zero to one after explicit play. Japan hero image loaded. Jiangnan mobile cost display preserved RM 8,554.47 and RM 4,277.24 per person.
- No new application error was observed in the checked English browser pages. The previously documented Hattori Coffee homepage hydration issue remains excluded from this work.
- All 3,567 baseline user files retained their hashes before commit. Original Admin/data/config work is excluded from this release commit.

Detailed local receipts are in `artifacts/bilingual-v1/`: publication, HTTP, route regression, cache trace, tests and build logs. Production receipts are added there after the release. The existing name cleanup commit is `9096b9e9ac14f0d772728d6ca01a5672fa7439ed`; the bilingual foundation is committed separately.

## Serverless acceptance correction

Initial Production acceptance found a 500 on an English Guide not included in the prebuilt pilot. Next's file tracer had omitted dynamically addressed JSON files from the ISR function, although they existed in the local workspace. The snapshot reader now uses traceable literal paths. After each build, run `node scripts/check-bilingual-bundle.mjs`: it verifies the actual English function manifest contains all five shared fallback snapshots and all 548 bundled Spot documents. This correction changes packaging/read paths only; it does not change Guangzhou content or budget. The full 644-route Chinese Production check passed before this correction.
