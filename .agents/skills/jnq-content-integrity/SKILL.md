---
name: jnq-content-integrity
description: Audit JnQ Journey Guide facts and relationships across itinerary text, dates, linked places, stays, budgets, and videos. Use before changing Guide content or when counts, ordering, dates, accommodation, totals, or media associations may conflict; do not make visual-design decisions.
---

# JnQ Content Integrity

Perform evidence-first consistency checks. Never invent missing travel facts or hide contradictions for presentation.

## Inputs

- The exact Guide slug.
- The persisted Guide source actually used by the page.
- Linked location, accommodation, affiliate, and media records available through existing read paths.
- A requested review-document path when unresolved findings must be retained.

## Workflow

1. Identify the real runtime source before auditing local JSON.
2. Preserve the workspace and use read-only queries for verification.
3. Build a day-by-day evidence table.
4. Classify every finding as confirmed, conflicting, missing, or unverifiable.
5. Correct only facts directly established by existing saved evidence and within the user's requested scope.
6. Write unverifiable or conflicting items to the review document; do not guess.

## Required checks

- Check date continuity and duplicate dates.
- Reconcile declared trip duration with the first-to-last saved date range.
- Compare accommodation named in narrative text with the linked stay record and stay range.
- Compare stated place counts with resolved, rendered place cards.
- Check linked-place order against persisted sort/order.
- Parse budget values, sum categories, and compare with the declared total; do not label a total “per person” without explicit evidence.
- Check every video URL, repeated-video grouping, and available date/day association.
- Confirm missing stays or media are truly absent rather than unresolved.
- Flag social-media headers or duplicated day labels embedded in narrative text as source-content issues.
- Do not conceal unresolved linked names, date conflicts, or stay conflicts in CSS.

## Output

Provide the evidence source and timestamp, a compact day-by-day findings table, confirmed corrections if authorized, unresolved findings with exact fields and evidence gaps, budget reconciliation, and the review-document path.

## Responsibility boundary

Do not choose visual hierarchy, typography, colors, responsive layouts, metadata, loading strategy, or browser viewport coverage. Hand those to the corresponding JnQ Skills.

## Safety

Do not read or output `.env.local`, credentials, tokens, or private user data. Do not install dependencies, run destructive commands, change live databases, commit, or push unless the user explicitly requests those actions in the current task.
