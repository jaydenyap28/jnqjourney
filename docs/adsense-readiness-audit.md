# JnQ Journey AdSense Readiness Audit

Audit date: 2026-07-24 (Asia/Singapore)

Production audited: https://www.jnqjourney.com

Purpose: pre-application content, trust, indexing, image, link, and mobile-readiness review.

## Scope and method

- Used the live production `sitemap.xml` as the URL source.
- Audited 30 rendered production pages: home, 5 regions, 15 spots, all 5 guides, all published longform notes (1), packages, Privacy, and Contact.
- Checked HTTP status, title, description, canonical, H1 count, rendered text volume, image alt presence, obvious Not Found output, affiliate prominence, and duplicate sampled metadata.
- Requested 120 unique rendered image URLs and 120 unique internal links from the sample.
- Reviewed the new About, Editorial Policy, Affiliate Disclosure, Copyright, expanded Privacy, and expanded Contact routes in the implementation build.
- This is a read-only content audit. It does not bulk-generate location descriptions or change location/package publication state.

Production sitemap inventory at audit time:

| Type | Count |
| --- | ---: |
| Total URLs | 599 |
| Region detail pages | 32 |
| Spot detail pages | 552 |
| Guide detail pages | 5 |
| Published longform notes | 1 |
| Package detail pages | 2 |

## Sample

Regions:

- `/region/batam-38`
- `/region/harbin-44`
- `/region/lijiang-74`
- `/region/sarawak-39`
- `/region/yamanashi-55`

Spots:

- `/spot/youchao-villa-807`
- `/spot/green-view-garden-767`
- `/spot/spot-703`
- `/spot/airdence-657`
- `/spot/san-hao-cang-ku-shanghai-612`
- `/spot/zhuo-rui-da-jiu-dian-dali-hotel-546`
- `/spot/ha-er-bin-han-ting-harbin-hotel-501`
- `/spot/wu-kang-lu-shanghai-453`
- `/spot/warashiyu-footbath-413`
- `/spot/shibuya-sky-359`
- `/spot/tai-gu-cang-ma-tou-guangzhou-311`
- `/spot/masjid-beijing-rantau-panjang-244`
- `/spot/sungai-pandan-waterfall-145`
- `/spot/kopi-434-70`
- `/spot/pantai-mawar-5`

Guides and notes:

- `/guide/malaysia-east-coast-route3-10d9n`
- `/guide/china-harbin-xuegu-changbai-beijing-11d10n`
- `/guide/china-dali-shangri-la-lijiang-11d10n`
- `/guide/japan-hokkaido-yamagata-tokyo-10d9n`
- `/guide/china-guangzhou-8d7n`
- `/notes/malaysia-turtle-night-terengganu`

## Findings

### Critical

No confirmed Critical issue was found in the sampled public routes.

### High

1. **The shared fallback image returned 404.**

   Production rendered `/placeholder-image.jpg` on the home page, but the file did not exist. Any location without a valid cover could therefore show a broken image. Fixed in this change by adding a local 1600 x 900 branded fallback asset. This does not alter any saved location image.

2. **Core trust and disclosure pages were incomplete or absent.**

   Production had short Privacy and Contact pages, but no public About, Editorial Policy, standalone Affiliate Disclosure, or Copyright page. The missing pages and expanded content are implemented in this change, with canonical metadata, social metadata, breadcrumbs, schema, sitemap entries, and footer access.

3. **One home-page image depends on an expiring Facebook CDN URL.**

   The rendered source uses `scontent.fmkz1-2.fna.fbcdn.net`; the automated request returned 403. Browser delivery may still work, but this host is not a durable website image source and its signed URL can expire. Migrate the verified original to the site's R2 storage only after confirming ownership/source and the intended location record. This audit did not change it automatically.

### Medium

1. **Selected content pages need stronger original utility.**

   The following sampled pages had the least rendered editorial text after navigation/footer content was included:

   - `/spot/green-view-garden-767`: strengthen overview, what to expect, access/parking, suitable visit duration, current opening/pricing source, and practical notes.
   - `/region/yamanashi-55`: add a clearer region introduction, seasonal planning, transport hubs, suggested route groupings, and links between the listed spots.
   - `/guide/china-guangzhou-8d7n`: expand daily decision-making context, transport rationale, budget notes, what changed after the trip, and practical mistakes to avoid.
   - `/guide/japan-hokkaido-yamagata-tokyo-10d9n`: rich in linked images but comparatively light in explanatory text; strengthen route logic, winter transport constraints, reservation timing, and first-hand observations where supported.
   - `/packages`: add concise selection guidance explaining who each package suits and the key differences, while keeping supplier-confirmed pricing language.

2. **Home page had no H1 in rendered HTML.**

   The map-first experience started with lower-level section headings. Fixed by adding one non-visual, accessible H1 describing the site's map, spot data, and travel guides without changing the map layout.

3. **The published longform note duplicated the brand in its title.**

   The rendered title ended in `| JnQ Journey | JnQ Journey` because the page and root layout both applied branding. Fixed by returning the unbranded note title to the root metadata template.

4. **External image provenance remains a manual review item.**

   The sample included 27 `i.ibb.co` and 27 Supabase-hosted image URLs in addition to R2 assets. External hosting does not by itself indicate a copyright problem, but each non-original supplier/partner image should retain a source or permission record. The new Copyright and Editorial Policy pages clarify the public rule; asset-level provenance still needs editorial review.

5. **Spot inventory count should be reconciled before the application snapshot.**

   The live sitemap exposed 552 spot detail URLs, while the established site baseline referenced 549 locations. This may reflect legitimate additions, but the homepage count, database count, and sitemap count should be compared on the same production revision to rule out stale or unintended index entries.

### Low

1. The sampled production pages all returned HTTP 200 and supplied canonicals.
2. No duplicate title or duplicate meta description was found within the 30-page sample.
3. Rendered images in the sample all had non-empty alt attributes.
4. No broken internal link was found among the 120 checked internal URLs.
5. The production sitemap contained only the two published package detail routes (`batam-3d2n` and `tioman-3d2n`) in the package section; no additional package draft URL was observed.
6. Affiliate and booking language was present but did not replace the main guide/note content in the sampled rendered pages. Continue keeping editorial content ahead of commercial widgets.

## Implementation completed with this audit

- Added `/about`, `/editorial-policy`, `/affiliate-disclosure`, and `/copyright`.
- Expanded `/contact` and `/privacy`.
- Added author trust blocks to guide and longform note detail pages, not database-only spot pages.
- Added WebSite, Organization, Person, ProfilePage, AboutPage, ContactPage, Article, and BreadcrumbList structured data where appropriate.
- Added dedicated, non-PII analytics events for About WhatsApp, Contact WhatsApp, policy links, and social links.
- Added all trust routes to the footer and sitemap.
- Added the missing local fallback image.
- Corrected the homepage H1 and longform note title branding.

## Remaining editorial actions

1. Replace the verified Facebook CDN image with an owned R2 object after source confirmation.
2. Strengthen only the five pages listed under Medium; do not mass-generate generic descriptions.
3. Reconcile the 549/552 location count on one production revision.
4. Keep an internal source/permission field or manifest for supplier and partner assets.

## Validation record

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; all six trust routes were prerendered.
- Local rendered routes: all six returned HTTP 200 with unique titles, descriptions, canonicals, H1 headings, and JSON-LD.
- Local sitemap: HTTP 200 and contains all six trust routes.
- Local robots: HTTP 200, allows public crawling, and points to the production sitemap.
- Mobile browser check at 390 x 844: all six trust routes and the homepage had `scrollWidth = clientWidth = 390`.
- Broken rendered images on those pages: none.
- About and Contact WhatsApp URLs contained `JNQ-ABOUT` and `JNQ-CONTACT` respectively.
- Footer contained About, Contact, Privacy, Editorial Policy, Affiliate Disclosure, and Copyright links.
