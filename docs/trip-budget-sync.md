# MoneyBot actual trip spend sync

JnQ Journey never reads MoneyBot's ledger. It accepts only confirmed, redacted
trip-level snapshots through `POST /api/admin/guide-budget-sync`.

## Server configuration

- Apply `supabase/migrations/202607260001_guide_budget_snapshots.sql`.
- Set `JNQ_BUDGET_SYNC_SECRET` on the JnQ server.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Configure the same secret as `JNQ_BUDGET_SYNC_SECRET` in MoneyBot, together
  with `JNQ_BUDGET_SYNC_URL`.

MoneyBot signs `<timestamp>.<nonce>.<raw JSON body>` with HMAC-SHA256. The API
accepts timestamps within five minutes, stores each nonce once, validates the
snapshot checksum, rejects unknown fields, confirms that the Guide slug exists,
and reconciles category amounts to the total.

## Review and publication

1. A valid sync creates an `imported` snapshot.
2. Imported data does not edit Guide JSON or the hand-entered budget.
3. An administrator reviews or rejects the snapshot.
4. Unclassified spend must be resolved before review.
5. Only a `reviewed` snapshot can become `published`.
6. Publishing a version moves the previous published version back to
   `reviewed`, so it can be restored later.
7. Public Guide pages select only the one `published` snapshot for that slug.

The public snapshot contains no account, card, wallet, receipt, full
description, private note, Telegram identity, or ledger row identifier.
