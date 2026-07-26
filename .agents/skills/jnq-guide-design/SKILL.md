---
name: jnq-guide-design
description: Define and review the visual system and responsive UX of JnQ Journey full-route Guide pages. Use for Guide Hero, route, budget, day itinerary, accommodation, typography, color, spacing, and mobile layout work; do not use to rewrite or infer factual travel content.
---

# JnQ Guide Design

Apply JnQ Journey's dark, refined travel-magazine direction to the reusable Guide template. Pair with `frontend-design` when implementing visual changes.

## Inputs

- The current Guide template and shared components.
- Representative long and short Guide data.
- Before screenshots at desktop and mobile sizes.
- Existing brand typography, colors, spacing, and image treatment.

## Workflow

1. Inspect the live or local page before proposing changes.
2. Confirm the change belongs in the reusable Guide template, not a route-specific hard-coded branch.
3. Preserve the dark premium editorial mood and the current JnQ brand.
4. Design mobile-first, then refine desktop composition.
5. Implement the smallest reusable component or style change.
6. Compare before and after screenshots at equivalent viewport and scroll positions.

## Visual rules

- Keep the Hero title to at most 2–3 lines on desktop and about 3–4 lines on mobile.
- Use responsive `clamp()` sizing plus balanced wrapping; avoid isolated Chinese characters or “攻略” on its own line.
- Retain visible cover-image detail while maintaining readable foreground contrast.
- Do not turn every section into a large rounded card. Use borders, editorial rules, open spacing, and restrained panels.
- Reserve gold for emphasis. Avoid excessive gold outlines, heavy shadows, glass layers, and stacked gray containers.
- Keep Chinese body copy at roughly 1.75–1.9 line-height with WCAG AA contrast.
- Keep Route, Budget, Day, and Accommodation visually distinct:
  - Route: concise sequence and directional rhythm.
  - Budget: total first, consistent numeric grid, tabular figures.
  - Day: strong day/date hierarchy, readable narrative width, ordered places.
  - Accommodation: compact stay identity plus optional booking action, without duplicate imagery.
- Use clear focus states and minimum practical touch targets.
- Prevent horizontal overflow at 390px.

## Content boundary

Do not rewrite, translate, infer, or alter dates, budgets, transport, places, accommodation, prices, weather, tickets, or first-hand experience. Hide a field only when it is absent, not when it conflicts. Route factual conflicts to `jnq-content-integrity`.

## Output

Report visual findings by Hero, Route, Budget, Day, and Accommodation; reusable files affected; mobile and desktop behavior; before/after screenshot paths; and unresolved contrast, overflow, or content-boundary risks.

## Safety

Do not read or output `.env.local`, credentials, tokens, or private user data. Do not install dependencies, run destructive commands, change production data, commit, or push unless the user explicitly requests those actions in the current task.
