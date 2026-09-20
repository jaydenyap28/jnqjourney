# Spot content network

The additive migration is `supabase/migrations/202609200001_spot_content_network.sql`.
It does not rewrite existing text, media, IDs, slugs, aliases or status. Apply it
before authors start using the optional fields. Legacy reads and unchanged saves
continue to work before migration; saving newly filled fields requires the schema.

## Storage and publishing

- `locations`: four localized SEO fields, two experience fields,
  `related_note_slugs text[]`, `image_metadata jsonb`, `redirect_url text`,
  `redirect_type integer` (301 by default; 302 supported).
- Image metadata is keyed by the existing image URL without its focus fragment;
  each entry has optional `alt_zh`, `alt_en`, and `caption`. Image arrays stay intact.
- Notes retain their existing `relatedSpotIds` and `relatedRegionIds`; optional
  ordered `relatedNoteSlugs` is stored with the complete Note JSON, including in
  the existing public snapshot. No relation table or separate Note database is added.
- Spot save publishes the existing public snapshots and requests English Pages
  ISR refresh. A refresh failure is reported separately from a successful save.
  Snapshot refresh does not modify the English translation overlay.
- Manual relations remain authoritative even when all selected records are
  missing/unpublished. They do not silently turn into automatic recommendations.
- With no manual Spots, recommendations use explicit region IDs and descendants,
  or geography from embedded Spot references. Unknown geography produces no
  recommendations. Related Notes additionally require overlapping tags.

## Redirect boundary

Redirects accept local `/notes/<slug>`, `/spot/<slug>-<id>` and their `/en/` forms.
External URLs, queries, fragments, encoded paths and traversal are rejected.
The database trigger rejects self/alias and multi-hop cycles; runtime checks also
limit chains to 16 hops. Hidden sources only redirect when explicitly configured.

Middleware reads `/api/spot-routing/<slug>` without caching before cached page or
alias handling, then returns an actual HTTP 301/302. Routing uses the existing
server-only Supabase service credential so it can inspect hidden records without
publishing their content. If routing cannot be verified, it returns 503 rather
than serving a potentially obsolete page. This adds a small authoritative database
read per Spot request; no stale redirect cache is introduced.

## Validation

`tests/spot-content-network.test.ts` exercises metadata, legacy/enriched React
rendering, image fallback, geographic isolation, ordered relations, Note payload
round-trip, loop rejection and real HTTP responses from the actual middleware
with isolated routing fixtures. Existing Spot/localization/Note/public-data tests
remain the regression set. No production content is required for these tests.

Local browser validation also covers relation search/add/remove/reorder, conditional
experience display, caption rendering, and a 390px viewport. The temporary fixture
page is removed after validation. Authenticated production saves and applying the
migration are separate deployment acceptance steps.
