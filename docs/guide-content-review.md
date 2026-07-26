# Guide content review

Reviewed: 2026-07-26 (Asia/Singapore)

Guide: `china-harbin-xuegu-changbai-beijing-11d10n`

Sources inspected:

- Persisted Guide fields exposed through `data/guides.json`.
- Production-rendered Guide page at `https://www.jnqjourney.com/guide/china-harbin-xuegu-changbai-beijing-11d10n`.
- Production dates and resolved place cards rendered from the current location records.

No uncertain date, stay, budget scope, place, or video association was changed during this review.

## Findings

| Area | Evidence | Status | Required follow-up |
| --- | --- | --- | --- |
| Dates | Production renders Day 1 Jan 6, Day 2 Jan 7, Day 3 Jan 7, then Day 4–11 as Jan 8–15, 2025. | Conflict | Confirm whether Day 3 should be Jan 8 and whether all following dates should shift. Do not infer this from sequence alone. |
| Duration | Declared duration is 11 Days / 10 Nights. The rendered Jan 6–Jan 15 range covers 10 calendar dates inclusive because Day 2 and Day 3 share Jan 7. | Conflict | Resolve the duplicate date first, then confirm arrival/departure dates and the final travel day. |
| Day 5 stay | Day 5 narrative says “入住长白山喜来客宾馆”; the linked stay is “栖溪小院” with a Day 5–7 range. | Conflict | Confirm which accommodation was actually used. Keep both visible to editors until confirmed. |
| Day 5 places | Persisted linked-place order is 山顺烤肉 → 恩都里 → 云鼎天宫; production renders three cards in that order. | Confirmed for linkage | Narrative also mentions 二道白河 and the accommodation, but these are not three additional linked place cards. Do not derive new records from prose. |
| Day 10 narrative | The saved summary starts with `Day 1️⃣0️⃣ 北京`, duplicating the structured Day header. | Confirmed source issue | Remove from the persisted summary only after the authoritative Guide source is updated through the normal admin/storage path. Do not hide it with CSS. |
| Place ordering | Production cards follow each day’s persisted `linkedSpots` order for the sampled Guide. | Confirmed | Continue treating `linkedSpots` as the route/card order. |
| Place counts | Production card counts match resolved linked cards for the inspected Guide, including Day 1 (5), Day 2 (4), Day 3 (1), and Day 5 (3). | Confirmed for current production | Keep development warnings for unresolved names or count mismatches. |
| Budget | 1,334 + 1,310 + 1,191 + 999 + 957 + 484 + 177 = RM6,452, matching the declared total. | Confirmed | The data does not state a people-count basis, so do not label this as per-person budget. |
| Videos | Saved grouping is Day 1–2, Day 3–4, Day 5–7, and Day 8–11, with one URL per group. Production currently loads one iframe for every day. | Grouping confirmed; day-level accuracy unverified | Confirm each group against the original trip/video chronology. The UI may repeat a lightweight thumbnail but must not eagerly load duplicate iframes. |
| Day 11 stay | The saved Beijing stay range is Day 8–10 and Day 11 has no stay field. | Confirmed as current data; intent unverified | Confirm whether Day 11 was departure day or whether accommodation is missing. Do not add a stay without evidence. |

## Day-by-day persisted linkage

| Day | Linked places | Stay source | Video group |
| --- | ---: | --- | --- |
| 1 | 5 | 汉庭酒店, range 1–2 | Harbin |
| 2 | 4 | Continued from Day 1 | Harbin |
| 3 | 1 | 雪谷丁子涵时尚家庭旅馆, range 3–4 | Xuegu |
| 4 | 2 | 雪谷丁子涵时尚家庭旅馆 | Xuegu |
| 5 | 3 | 栖溪小院, range 5–7; conflicts with narrative | Changbai |
| 6 | 2 | 栖溪小院 | Changbai |
| 7 | 4 | 栖溪小院 | Changbai |
| 8 | 1 | 潮漫酒店, range 8–10 | Beijing |
| 9 | 1 | Continued from Day 8 | Beijing |
| 10 | 3 | Continued from Day 8 | Beijing |
| 11 | 1 | None | Beijing |

## Editor requirements

- Store an explicit optional Day date when it is known; otherwise retain the date derived from linked location records.
- Keep unresolved linked names visible in development/admin review.
- Require gallery alt text.
- Show content-completeness warnings in admin instead of hiding public conflicts.
- Do not write missing facts from assumptions, visual design, or route order.
