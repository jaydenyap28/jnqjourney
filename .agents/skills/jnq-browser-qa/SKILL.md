---
name: jnq-browser-qa
description: Run browser-based visual and functional regression QA for JnQ Journey Guide templates across required desktop and mobile viewports. Use after Guide UI changes or before release to verify Hero, navigation, map, budget, itinerary, stays, galleries, video, footer, errors, status, and all published Guides; do not edit content or implementation.
---

# JnQ Browser QA

Validate the rendered product through the real browser. Syntax checks and HTTP checks alone do not prove interactive success.

## Inputs

- Base URL and target Guide slug.
- List of all published Guide slugs.
- Expected before state or before screenshots.
- Screenshot output directory.

## Required viewports

- 1440×900
- 1920×1080
- 390×844
- 430×932

## Test workflow

1. Open the target route and confirm a successful HTTP response.
2. Capture before/after evidence at equivalent viewport and scroll positions.
3. At every required viewport, inspect Hero, sticky day navigation, route map, budget grid, one long Day, one short or single-place Day, accommodation, gallery, video, and Footer.
4. Exercise keyboard navigation, day selection, hashes, scroll offsets, map markers, place cards, booking links, gallery modal, and video click-to-load when present.
5. Check horizontal overflow, broken images, hydration errors, console errors, controls, attribution, and eager iframes.
6. Sample every published Guide at desktop and mobile width for shared-template regressions.
7. Save screenshots with route, viewport, and section in each filename.

## Output

Provide a pass/fail matrix by viewport and feature, screenshot paths, exact click and scroll behaviors tested, HTTP/broken-image/hydration/console/overflow results, per-Guide smoke-test results, and blocked checks.

## Responsibility boundary

Remain read-only. Do not modify UI, content, database records, metadata, tests, or build configuration. Return defects to the responsible design, integrity, or SEO/performance workflow.

## Safety

Do not read or output `.env.local`, credentials, tokens, browser storage, or private user data. Do not install dependencies, run destructive commands, change production data, commit, or push.
