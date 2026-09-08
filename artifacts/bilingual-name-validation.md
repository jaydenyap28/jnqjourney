# Bilingual name presentation validation

Date: 2026-09-08. Local changes only; no database, snapshot, Guide data, canonical binding, commit, push or deployment writes.

## 1. Existing name schema

Raw Locations/Regions use `name` and `name_cn`. Lightweight records already encode both in `name`. Guides use `title`/`shortTitle` and editorial attraction `displayName`. Stays reuse Spot fields with optional `displayName`. No columns or API fields added. See [full audit](bilingual-name-audit.md).

## 2. Added shared helper

`lib/entity-display-name.ts`: pure `resolveEntityDisplayName(entity, 'zh' | 'en')` returns primary/secondary, normalizes whitespace, suppresses duplicates, safely splits exactly one spaced bilingual slash, and preserves editorial overrides. An explicit original-only list is taken from the request; no business-category translation heuristic runs in the renderer.

`components/EntityName.tsx`: shared inline-safe primary/secondary markup; secondary is 75% of title size, normal weight, white at 55%; long names wrap. Existing `getDisplayTitle` and `guideAttractionDisplayName` delegate to the resolver.

## 3. Modified components

- HomePageClient: Region cards, Spot updates/search cards and nested Region labels.
- LocationCard, SpotContent: card/detail/drawer/related names; removed repeated secondary text below the detail header.
- Region directory, Malaysia directory, Region detail/Spot cards.
- Guide page daily cards, GuideSegmentItinerarySection, GuideUnassignedVisits, GuideDayStayCard.
- BottomFloatingDock: homepage/search card names and minimum-height layout so wrapped titles are not clipped. Map behavior, markers, data and camera code unchanged.
- Guide title/shortTitle pairs already use separate lines; no change needed to that editorial title contract.

## 4. Region examples

`吉隆坡 / Kuala Lumpur` → primary `吉隆坡`, secondary `Kuala Lumpur`.
`仙本那 / Semporna` → primary `仙本那`, secondary `Semporna`.
Also checked Genting Highlands, Kota Kinabalu, Kota Bharu and Johor. The inspected Genting source says `云顶`; no speculative rename to `云顶高原` was performed.

## 5. Spot examples

`老鹰广场 / Dataran Lang` → two lines.
`珍南海滩 / Pantai Cenang` → two lines.
`Golden Bamboo 竹主题咖啡馆 / Golden Bamboo Cafe` → `Golden Bamboo Cafe` only.
`串吧日式居酒屋 / Chuan Bar Izakaya - Japanese Fusion` → original only.

## 6. Langkawi preservation

The 11 original-only names listed in the request are explicitly protected, including the five named restaurants, Dream Forest Langkawi, MAHA Tower, Villa Paddy, Airis Sanctuary Resort Langkawi, Crab Langkawi Farm and Restaurant, and Tanjung Rhu Mangrove Jetty. Unknown translations are preserved for review. Guide displayName still has highest priority; no ID, slug, order, enabled flag or itinerary draft edits.

## 7. Audit count

Read-only production API inventory: 575 Spots / 58 Regions. Spots: A 6, B 164, C 25, D 380. Regions: A 6, B 0, C 0, D 52. A is deliberately limited to explicitly supported natural pairs. C is a heuristic review candidate, not proof of machine translation. The older 23-row Langkawi proposal is reported separately (A 6, B 8, C 1, D 8), not added to production totals.

## 8. /api/locations payload impact

Same captured production dataset, compact UTF-8 JSON: before **457,323 bytes**, after **457,323 bytes**, delta **0%**. Resolver calls do not mutate the payload; the API route, serializers, public data types and queries are unchanged. No description/gallery expansion.

The first sandbox-only local response was an older 547-Spot static fallback (446,553 bytes); a later local CDN response contained 570 Spots (455,263 bytes). These different source snapshots are not used as a before/after comparison. The full production read and byte calculation are retained in `bilingual-name/`.

## 9. Tests

27/27 targeted tests passed: entity display, Guide display priority/bindings and public data contract. Cases cover six requested Regions, five natural Langkawi attractions, all protected original names, whitespace, case-insensitive duplicates, ambiguous slashes, Guide aliases and nonmutation.

## 10–12. Lint / tsc / build

Targeted ESLint passed; build includes project lint/type checks. `tsc --noEmit` passed. `npm run build` passed. Build and tests logs are retained in `bilingual-name/`.

## 13. Browser smoke

Actual browser checks at 390, 430, 1440 and 1920 px: Homepage, Golden Bamboo search, Semporna search, Region directory, Kuala Lumpur/ Langkawi Region detail, River Of Life / Golden Bamboo Spot detail, and Langkawi Guide. All measured page widths had **0 horizontal overflow**. Search retained results and displayed the original brand or two-line Region label.

All seven published Guide routes were sampled at actual 390 and 1440 px: Jiangnan, East Coast, Northeast China, Yunnan, Japan winter, Guangzhou, Langkawi. All had 0 horizontal overflow. This was focused name/layout smoke, not a new gallery/map/budget/booking/media acceptance audit.

To avoid source timeouts reverting to the August fallback, the final Langkawi test served the captured public API dataset through a temporary localhost-only CDN fixture, using the application's existing read path. With resolved Spots, the Guide rendered 28 name blocks including both stays, 14 secondary names, 0 duplicate pairs and 0 overflow at all four widths. The Sky Bridge link remained `/spot/langkawi-sky-bridge-810`. Mobile screenshots were visually inspected: secondary labels have lower emphasis and long business names wrap. Temporary fixture/server overrides are not application code.

**Known baseline console issue:** Homepage hydration errors reproduce with the original HEAD version of BottomFloatingDock, before the name-rendering changes. The public `Hattori Coffee` row (ID 235) has a `shortSummary` ending with lone UTF-16 high surrogate `0xD83C`; the server/client summary text differs. Production reports React #425/#422; development identifies the same summary paragraph. No new name-related error was found; an absolute 0-console-error claim is not made. The original component was restored only for that comparison and then the final edited component was restored byte-for-byte. Summary/data repair is outside this name-only task.

Initial development reload also produced one transient layout-chunk SyntaxError; direct chunk syntax validation and subsequent reload succeeded. Final Guide runs produced no new console errors. Existing image sizes/LCP warnings are unrelated.

## 14. Commit

Not committed or pushed. Existing unrelated workspace modifications remain intact. No deployment performed.
