# Local site fonts

Both Routers import `lib/site-fonts.ts`. The four existing families and CSS variables remain:

| Family | CSS variable | Normal weights |
| --- | --- | --- |
| Poppins | `--font-poppins` | 300, 400, 600, 800 |
| Noto Sans SC | `--font-noto-sans-sc` | 300, 400, 500, 700 |
| Noto Serif SC | `--font-noto-serif-sc` | 400, 500, 600, 700 |
| Cormorant Garamond | `--font-cormorant-garamond` | 400, 500, 600, 700 |

The Latin primary faces use `next/font/local`. Poppins is distributed as static weights; Cormorant and both Noto families use variable WOFF2 data while keeping the existing discrete CSS weight declarations. The Noto files and supplementary scripts use local `@font-face` rules with their original Unicode slices. Next 14's local loader cannot attach a different `unicode-range` to each item of a `src` array; treating all CJK slices as unrestricted local-font sources would defeat selective loading. All CSS URLs are same-origin versioned assets. There is no build-time or runtime Google Fonts fetch.

Font family order, display/sans roles, non-font layout CSS, normal styles and `font-display: swap` are retained. The adjusted Arial/Times New Roman fallback metrics are copied exactly from the previously used Next 14.2.35 Google-font metrics, rather than replacing the typefaces with system fonts. Named same-family Unicode supplements are tried before the metric fallback. Existing fallback fonts are used only while fonts load or for characters outside the covered repertoire.

## Source, integrity and license

`public/fonts/manifest.json` records immutable npm package versions, SHA-512 archive integrity, every WOFF2 SHA-256/size, configured weights, copyright attribution, and pinned upstream GitHub URLs/revisions/SHA-256 for the generated supplements.

- Fontsource packages: `@fontsource/poppins@5.3.0`, `@fontsource-variable/cormorant-garamond@5.3.0`, `@fontsource-variable/noto-sans-sc@5.3.1`, `@fontsource-variable/noto-serif-sc@5.3.1`.
- Publisher: https://fontsource.org/ . Registry archives were verified against npm's declared SHA-512 integrity before extraction. No font packages were added to package.json or the application lockfile.
- Supplement originals: Google Fonts' `ofl/notosanssc` and `ofl/notoserifsc`, pinned to the revisions in the manifest. Full upstream TTFs are temporary generation inputs, not shipped resources.
- Every family retains the full OFL license in its versioned public directory. Both Noto families also retain the upstream OFL/copyright notice alongside their derived subset. The reserved name `Source` is not used as a modified font's primary name.
- The 343-character supplements were made with FontTools 4.68.0 and Brotli 1.2.1, retaining variable weight data, names and copyright tables. `scripts/fonts/subset-site-fonts.py` reproduces that transformation from locally supplied, checksum-verified source TTFs. It is not run by `next build` and requires no application dependency change.

## Coverage

The publisher's Noto web slices alone omitted two characters found in the current public corpus (`潓`, `馝`) and some common simplified/traditional characters. Each same-family supplement adds only the missing 343 codepoints; the original publisher slices are preserved intact.

The font test checks real glyph maps and CSS Unicode coverage, not filenames alone: all 2,591 distinct Han characters currently in app/components/data/public-data, the 6,763 Han characters decoded from the GB2312 Han byte rectangle, Big5 level-one common Han characters, representative punctuation and Latin text. The combined test repertoire contains 8,934 codepoints. This is not a claim to cover every Unicode character; when future content introduces an uncovered rare character, extend the supplement using the pinned same-family upstream font and rerun the test.

## Size and page loading

- 221 WOFF2 resources total **11,201,068 bytes (10.68 MiB)**, including the two supplements, which total only 331,320 bytes. No 17 MB/25 MB full source TTF is shipped.
- WOFF2 + generated font CSS + licenses/provenance manifest total **12,122,664 bytes (11.56 MiB)**. These are source/deployment resources, not a per-page download.
- Only five Latin primary resources preload: **69,188 bytes (67.6 KiB)**. The variable Cormorant file is shared by all its configured weights and both Routers. Noto/supplementary-script files are not preloaded; browsers select them by Unicode range and actual font use.
- The font-face CSS is 812,692 bytes before compression, 73,519 bytes with gzip in the local experiment. Complete built App/Pages stylesheets are approximately 104.5/110.1 KB gzip including existing site styles. Four discrete weight declarations reuse each variable WOFF2 URL; they do not download four copies.
- Versioned public font paths receive a one-year immutable cache header. Next's emitted Latin assets already use content-hashed immutable paths. Actual CJK requests depend on page characters; the whole 10.68 MiB set is never preloaded as a bundle.
- The previous online Google font path was already self-hosted by Next at build time. No precise before/after browser transfer comparison is claimed because that RC build failed and did not retain a reliable comparable final artifact.

## Verification

Node 24.13.0, unchanged package-lock dependency graph, Next 14.2.35. Font tests, TypeScript and changed-file lint passed. The final isolated Production-mode `next build` completed successfully, including all **79/79** static generation tasks and both Routers. No Google Fonts requests occurred and generated CSS contains no Google Fonts origin. The temporary verification environment used non-routable public Supabase placeholders and no Production dotenv or credentials; all external requests were intercepted, with only expected placeholder read attempts blocked. No Production data writes, Preview changes, push or deployment occurred. These placeholder-configured local build artifacts must not be deployed.

Existing unrelated lint warnings and the 658 KB English home page-data warning remain recorded without scope expansion.
