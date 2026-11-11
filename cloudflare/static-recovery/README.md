# Full public static recovery candidate

Preview-only, with Production migration on HOLD. No Functions or admin routes are shipped.
The original Next 14 public components, CSS, map, galleries and static English adapter are reused. Root app/admin and all production APIs remain intact.

The [P0 launch readiness checklist](P0-LAUNCH-READINESS-2026-11-11.md) records the follow-up media probes, proposed withdrawal policies, and production indexing and rollback prerequisites.

## Repeatable local publication fallback

Use the existing Node/dependencies and existing Wrangler login. Do not install or upgrade frameworks.
The locally held `.public-read-key.json` under `artifacts/cloudflare-static-recovery` is a project-bound **anon** key acquired via the official connector; it is never copied into the output. No `.env.local` input is required.

```powershell
# One-time local setting: point to the already installed Wrangler CLI .js file.
$env:JNQ_WRANGLER_CLI = '<existing Wrangler CLI path>'
npm run cf:recovery -- --check
npm run cf:recovery -- --deploy-preview
```

Without `--deploy-preview`, the same command builds and verifies locally. Each execution uses a new `artifacts/cloudflare-static-recovery/runs/<id>` directory and preserves earlier artifacts.

The controller serializes local publication attempts, coalesces unchanged content/code, limits itself to 8 builds/day and 240/month, and enforces 10 minutes between attempts. Failed builds count. These are local safeguards, **not** proof of account-wide remaining quota. It never runs on each field change. It does not receive browser requests.

Capture performs bounded public SELECTs and authority-pointer reads, checks before/after equality, filters public eligibility and keeps drafts/private fields out of staging. It is not a cross-system transaction. Before deployment, it checks the captured sources again; a change stops publication and requires a fresh capture/build.

Stages reuse `prepare-static-candidate.mjs --recovery`, `build-candidate.mjs --recovery`, `package-candidate.mjs --recovery` and `verify-static-candidate.mjs --recovery`. Logs and result receipts stay in the run directory. The new orchestration entry was syntax/guard checked; each underlying stage was actually executed for the accepted candidate. It was not used to repeat the whole build just to test the wrapper.

Only `jnqjourney-static-recovery-candidate` Preview is allowed. The deployer refuses Production canonical/deployments, Git autodeployment, custom domains, Secrets or bindings. It uploads plain files. After ambiguous submission or receipt failure, **do not redeploy blindly**:

```powershell
$env:JNQ_RECOVERY_OUTPUT = '<the existing run directory>'
node scripts/cloudflare/recovery-deploy.mjs --verify-existing
```

This command only reads deployment state and compares the deployed receipt. Remove the environment override afterward. Do not use a different run to hide an unknown outcome. For a stale local lock, inspect the recorded PID/run and outcome before removing only that lock manually; the script does not steal locks or delete someone else's resources.

## Independent admin and publication work remaining

Original admin forms are preserved, not included in the public package. Spot's isolated Edge/Bridge/Registry technical acceptance remains valid; it does not prove that the product admin is running independently.

Next minimum implementation: separate static admin entry using existing React forms and Supabase Auth, server-side administrator checks, isolated authenticated reads, and the already verified privileged Edge/upload paths. Spot, Note and Guide require their own legitimate versioned write protocols; Note/Guide must not be forced into a Spot RPC. Validate login, save/readback, version conflict, expiry and ordinary-user denial for each before `ADMIN_READY`.

`cloudflare/publication-outbox.sql` and `publication-worker.mjs` remain prior drafts, unapplied. Their project/branch/receipt assumptions require adaptation and isolated review before use. No new SQL or cron was executed. The intended flow is draft save → explicit publish → authenticated dirty revision/outbox → bounded coalesced build → verified deployment receipt → acknowledge that exact revision. A lease with unknown submission status must remain for reconciliation; publication cannot be acknowledged merely because a build started. Browser clients must never receive hook URLs, OAuth/API tokens or service-role credentials.

## Withdrawal and recovery rules

Static pages enforce eligibility **at build time**. Saving or hiding in the database does not change deployed HTML/JSON/images. `max-age=0, must-revalidate` improves revalidation but does not erase downloads, browser history, external caches or hash-addressed old Preview deployments.

Before any formal cutover, obtain a user-approved withdrawal policy and implement/accept its actual upper bound. Proposed procedure: mark content withdrawn in the authoritative store, prioritize one coalesced rebuild, verify absence in all pages/JSON/indexes and shared-media ownership, deploy the complete version, check canonical/alias/API responses, then invalidate relevant authorized cache layers. Failure keeps the prior version online, which is an **unsolved immediate-withdrawal requirement**, not a safe real-time fallback. A separately authorized emergency deny/maintenance mechanism would need its own acceptance. Do not imply the present runner provides it.

Old `jnqjourney-img` public media cannot be made revocable by changing site DNS. Keep originals untouched. Before requesting permission to disable r2.dev: provide alternative verified media access for every legal owner (including shared Spot/Note/Guide/region/package uses), replace references in all HTML/feeds/metadata, verify the full candidate, record the breaking external links, then ask separately for the public switch. This turn performed no such switch.

Keep source manifests, code SHA, static package and SHA-256 receipts for each release in an approved backup location. The captured public export is **not** a full database/Auth/RLS/private-media backup. A complete read-only production backup plus restore drill needs separate scoped handling. Roll back only to a package compatible with current withdrawn/revoked content; never use a stale deployment or reopen r2.dev to bypass revocation. Formal DNS/Production cutover remains a separate user decision.

For this local public candidate, a reproducible file backup can be made without touching any remote resources (choose a new archive filename):

```powershell
Compress-Archive -LiteralPath artifacts/cloudflare-static-recovery/deploy,artifacts/cloudflare-static-recovery/sources,artifacts/cloudflare-static-recovery/source-manifest.json -DestinationPath artifacts/cloudflare-static-recovery/public-candidate-20261111.zip
Get-FileHash -Algorithm SHA256 artifacts/cloudflare-static-recovery/public-candidate-20261111.zip
```

Keep that archive and hash privately with the matching Git commit, separate from browser assets. Restore into a new empty local directory, compare the hash, verify the complete static candidate, and deploy only Preview for the recovery drill. No backup archive, production dump or restore drill was executed by this turn.
