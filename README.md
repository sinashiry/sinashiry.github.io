# Sina Shiri — portfolio website

Source of [sina-shiri.com](https://sina-shiri.com/), the CV and engineering portfolio of Sina Shiri. It is a static [Astro](https://astro.build/) site deployed to GitHub Pages and edited through [Pages CMS](https://pagescms.org/). There is no server, database, contact form or analytics.

The site features four homepage cases with labelled AI cover illustrations, ten detailed project case studies, a filterable media gallery, a public GitHub repository directory refreshed on a schedule, academic profile and reference sections, a blog and a publications list. Contact is by email.

## Start here

- [AGENTS.md](AGENTS.md): working rules for maintainers and coding agents.
- [Knowledge index](knowledge/index.md): architecture, decisions, operations and current status in Open Knowledge Format v0.2.
- [Editing guide](docs/EDITOR.md): how the owner edits text, CVs, posts and papers in Pages CMS.
- [Current status](knowledge/status.md): what has been verified and what is still pending.

## Commands

Use Node 24 or later.

```bash
npm install                     # CI uses: npm ci --omit=dev --ignore-scripts
npx playwright install chromium # once, for the smoke test
npm run check                   # content contract and .pages.yml freshness; writes nothing
npm test                        # Node test suite in scripts/tests/
npm run build                   # compose content, astro build, prepare-pages -> dist/
npm run smoke                   # serve dist/ like Pages and drive every route in headless Chromium
npm start                       # preview dist/ at http://127.0.0.1:4322/
npm run dev                     # authoring server (no post-build step)
```

Maintainer tools: `npm run compose` writes the generated `src/data/content.json`, `npm run pages-config` regenerates `.pages.yml`, and `npm run split` supports reviewed shape changes (see the header of `scripts/split-content.mjs`).

## How content becomes the site

`content/` → `scripts/compose-content.mjs` → `src/data/content.json` → `astro build` (with the `src/content/` collections) → `scripts/prepare-pages.mjs` → `dist/` → GitHub Pages

- **Editable text** lives in `content/cms/`. The locked shape and values are in `content/structure.json`, and the per-field rules in `content/contract.json`. `scripts/compose-content.mjs` validates and merges them into `src/data/content.json`, which is generated and git-ignored.
- **Blog posts** are `src/content/blog/<slug>.md` and **papers** are `src/content/papers/*.json`. The file name is the permanent slug. The Blog appears in navigation and search once 3 posts are published, and Publications once 1 paper is published. Below that, the index pages are `noindex,follow` and left out of `sitemap-collections.xml`.
- **CV PDFs** are uploaded to `content/uploads/cv/` and selected in `content/cms/downloads.json`. The build validates them and publishes them at `/downloads/` and the legacy WordPress URL. The LaTeX sources in `public/downloads/` are separate and are not updated automatically.
- **`scripts/prepare-pages.mjs`** post-processes the build:
  - removes empty or unapproved recommendation, reference and profile slots;
  - writes the GitHub directory JSON;
  - writes static stubs for legacy WordPress URLs, plus a query-link hook;
  - adds a hash-based Content-Security-Policy meta and a referrer meta to every page;
  - fails the build on private identifiers, third-party assets, dotfiles or oversized files.
- **The GitHub directory** on `/code/` is refreshed every 6 hours by `.github/workflows/github-repositories.yml`. A new snapshot is committed only when repository data changes, or weekly as a heartbeat. The site repository's own timestamps are ignored, so its commits never trigger another refresh. Public descriptions come only from the reviewed `src/data/repository-overrides.json`.

See [architecture](knowledge/architecture.md) for details.

## Editing, release and rollback

- **Owner edits** are made in Pages CMS, which commits to `main`. **This repository is public:** everything saved there is public in Git history immediately, including drafts, unapproved recommendations, referee slots and uploads. The build hides incomplete entries from the website, but they are not private.
- **Release = merge to `main`.** `.github/workflows/pages.yml` runs check, test and build, then deploys only `dist/`. A failure leaves the live site unchanged.
- **Rollback = `git revert`** of the offending commit on `main`. Do not force-push: Pages CMS and the sync workflow also commit to `main`.

See [operations](knowledge/operations.md) for repository settings and the DNS cutover checklist.

## Project map

| Location | Responsibility |
| --- | --- |
| `content/` | Editable CMS content, locked structure, field contract, editor labels and CV uploads |
| `src/pages`, `src/layouts`, `src/components` | Routes, metadata and reusable presentation |
| `src/scripts`, `src/styles` | Small progressive enhancements and the screen-only dark theme |
| `src/lib`, `src/content` | Build-time collection rules and the blog/paper collections |
| `src/data` | GitHub snapshot, reviewed repository copy, cover map and media metadata (plus the generated `content.json`) |
| `public/` | Reviewed media, thumbnails, font and licence, LaTeX CV sources, favicon and `robots.txt` |
| `scripts/` | Compose, Pages CMS config, post-build step, GitHub sync, smoke test and maintainer tools; tests in `scripts/tests/` |
| `.github/workflows/` | Pages deploy and scheduled GitHub directory refresh |
| `docs/` | Owner editing guide and image/media provenance |
| `knowledge/` | Maintainer knowledge bundle |

## Content and evidence rules

Public claims come only from reviewed content, source evidence and explicit owner corrections:

- **No invented claims:** no ranks, certifications, affiliations, research results, measurements, papers or publication acceptance.
- **Credit and grades:** collaborator credit and original GPA scales are kept.
- **IstaSanat** employment is 2017–present.
- **Trading material** stays out of the curated CV and project narrative. The GitHub directory still lists every public repository, as the owner requested.
- **Recommendations and references** appear only when they are authentic, complete and approved for publication.
- **Generated covers** and the aerial concept image are labelled as illustrations, not photographs or results.
- **Project media** are privacy-edited copies, and the videos are silent.

The full rules are in [decisions](knowledge/decisions.md). Image provenance:

- [project covers](docs/project-cover-provenance.md)
- [aerial concept image](docs/aerial-concept-image.md)

## Rights

Unless otherwise noted, content and media are © Sina Shiri, all rights reserved. This includes the text, CVs, photographs, videos, illustrations and the logo. No licence is granted to reuse them. Third-party names, client marks, book covers and footage shown in project material belong to their respective owners.

The Space Grotesk font is used under the SIL Open Font License 1.1; its licence is in [public/assets/SPACE-GROTESK-LICENSE.txt](public/assets/SPACE-GROTESK-LICENSE.txt).

The knowledge bundle follows the pinned [Open Knowledge Format specification](knowledge/format.md).
