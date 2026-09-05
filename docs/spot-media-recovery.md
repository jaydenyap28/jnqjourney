# Spot media recovery — Phase 1

This is a media-only publication path, not an authoritative data editor. Phase 1 is deliberately limited to Spot 449 (`spot-449`). Do not use the existing full rebuild or generic publisher for recovery.

## Boundaries

- Live `locations` is the authoritative source of `image_url`, `images`, `video_url`, and `facebook_video_url`.
- The current public detail supplies every non-media field. Recovery overlays only those four fields; any candidate non-media diff fails closed. Source metadata accurately states `media-only`, not that every public field has been reconciled.
- Raw authoritative gallery order/URLs are retained, including duplicates. Display dedupe uses exact URL / known R2 object identity and preserves the first occurrence. HTTP status never removes an item; 429 is unknown availability.
- The generic publisher excludes all Spot detail/index keys and rejects them before any upload. The lightweight builder is create-only, rejects `--replace-lightweight`, and never manufactures `images` from thumbnail. Neither tool can replace a recovered full-media object.
- No Supabase writes, 546 other Spot recoveries, locations/regions/Guide writes, index writes, renderer changes, or global cache purge.

## Prepare and review

Run `node scripts/recover-spot-media-449.mjs`. This reads live media and R2, then writes only local evidence under `artifacts/spot-media-recovery-449/<timestamp>/`:

- Exact R2 backup, ETag, headers, source, SHA-256.
- Live authoritative media, candidate bytes and SHA-256.
- Machine-readable media/non-media diff; full non-media semantic hashes.
- ETag/size baseline of every other public R2 object and lightweight API baselines.

Require six gallery URLs in the exact authoritative order, the independent cover, seven unique display items, both video fields unchanged from live data, and zero non-media differences. Do not edit the prepared candidate or use a Production/R2 response as authoritative media.

## Reviewed single-object apply

Only after reviewing `diff.json`, run:

```
node scripts/recover-spot-media-449.mjs --apply=artifacts/spot-media-recovery-449/<timestamp> --approved-sha256=<reviewed candidate SHA-256>
```

Apply re-reads live media and the R2 baseline, checks hashes and other-object state, then conditionally writes exactly `public-data/spots/spot-449.json` with `IfMatch`. SDK automatic retries are disabled. It reads the object back and verifies its complete byte hash and contracts. An already-published candidate fails rather than repeating publication. A failed/uncertain apply requires read-only inspection; never blindly rerun it.

The local backup is the rollback source; rollback must be reviewed and conditionally target the exact object. The script does not silently roll back, revalidate, or repeat any write.

## Precise cache refresh

`POST /api/admin/public-data/spots/449/revalidate` accepts JSON `{slug, sha256, issuedAt}`. `x-jnq-maintenance-signature` is HMAC-SHA256 of the exact request body with the existing R2 secret access key. `issuedAt` is milliseconds and expires after 60 seconds. Never log the signature or secret.

The server independently reads the R2 object and checks its SHA-256 and identity before invalidating only `public-spot:spot-449`, `/spot/spot-449`, and `/api/spots/spot-449`. It has no data upload, Supabase, or rebuild path. Authentication failures and missing/mismatched objects do not invalidate caches. Responses are private/no-store; public cache policy is unchanged.

## Acceptance

Verify API six-gallery/cover/videos, second-request HIT, unchanged lightweight locations/Guides hashes, and all seven gallery positions in desktop 1440×900 / 1920×1080 and mobile 390×844 / 430×932. Check no horizontal overflow, broken/empty media or new console errors. Preserve the existing canonical redirect and renderer. Do not expand Phase 1 if a different browser URL/cache requires an additional scoped operation; report it for approval.

Run lint, TypeScript, all test files and build. Recovery tests include destructive publisher exclusion, missing/count/order/media regression, duplicates, unchanged non-media fields, 449 fixture and authenticated precise revalidation.
