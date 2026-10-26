# MoneyBot actual trip spend sync

JnQ Journey never reads MoneyBot's ledger. It accepts only confirmed, redacted
Project-level snapshots through `POST /api/admin/guide-budget-sync`. MoneyBot's
exact Ledger Project tag is the ownership source; dates, merchants and keywords
are not accepted as substitutes for a configured Project → Guide mapping.

## Server configuration

- Apply migrations through
  `supabase/migrations/202607260002_project_budget_source.sql`.
- Set `JNQ_BUDGET_SYNC_SECRET` on the JnQ server.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Configure the same secret as `JNQ_BUDGET_SYNC_SECRET` in MoneyBot, together
  with `JNQ_BUDGET_SYNC_URL`.

MoneyBot signs `<timestamp>.<nonce>.<raw JSON body>` with HMAC-SHA256. The API
accepts timestamps within five minutes, stores each nonce once, validates the
snapshot checksum, rejects unknown fields, confirms that the Guide slug exists,
and reconciles category amounts to the total.

The accepted snapshot source is `moneybot_project`. Its aggregate contract
contains the Project key/name, Guide slug, currency, scope, traveller count,
total, public categories, transaction count, timestamps, version and checksum.
It rejects event/date selection fields and all transaction-detail fields.

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
description, merchant, import ID, private note, Telegram identity, full date
detail, or ledger row identifier. The public page shows the Project display
name, never its internal key, checksum, nonce, API path, or database ID.
