# Spot content network

The additive migration is `supabase/migrations/202609200001_spot_content_network.sql`.
It does not rewrite existing text, media, IDs, slugs, aliases or status. Apply it
before authors start using the optional fields. Legacy reads and unchanged saves
continue to work before migration; saving newly filled fields requires the schema.

## Storage and publishing

- `locations`: optional `publication_status` (published/draft/hidden; NULL preserves legacy behavior), four localized SEO fields, two experience fields,
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

The existing business/operating `status` is unchanged. Publication and redirect checks
use the separate nullable `publication_status`; existing business filters remain intact.

## Single Spot Note publication

`POST /api/admin/public-data/spots/<id>/related-note` requires an allowlisted admin
Bearer token. It is disabled unless the request uses the production origin,
`VERCEL_ENV=production`, and `JNQ_SPOT_NOTE_PUBLICATION_ENABLED=1`. Preview keeps
the writer disabled and exercises the same handler with mocked stores.

1. Submit `{"noteSlug":"<canonical-published-slug>"}` to prepare. Keep the returned
   `receipt` with the prior relationships, row version, object ETag and slugs.
   Before any future live operation, retain a read-only copy of the exact indexed
   detail object and confirm the deployed database has the version trigger and
   no full-site publisher hooked to a relationship-only update.
2. Submit `{"noteSlug":"<same-slug>","expected":<receipt>}`. The row update
   compares the prior version and relationships. The object update uses
   `If-Match` and preserves the previous document and metadata except for the
   relationship field. Success requires readback and target-only revalidation.
3. For a `503` with `retry_same_receipt` in its code, replay the exact second
   request. It checks what persisted and resumes the remaining step. For a
   `409` after a partial write, keep the receipt and inspect the authoritative
   row, index and object before retrying. There is no automatic rollback over
   newer edits.

The operation requires the Chinese and English readers to agree on the existing
indexed detail object and canonical Spot slug. A missing indexed object or a
relationship that would change a quality decision from noindex to index blocks
the operation. The index, location list, Notes and Guides are read-only here.

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
