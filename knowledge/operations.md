---
type: Playbook
title: Setup, validation, release and cutover
description: Local commands, validation gates, release by merge to main, rollback by revert, maintainer procedures and the DNS cutover checklist.
tags: [operations, testing, release]
status: stable
generated:
  by: claude-code/claude-opus-5.5
  at: "2026-10-11T21:45:00Z"
sources:
  - id: scripts
    resource: ../package.json
    title: Project commands
  - id: deploy
    resource: ../.github/workflows/pages.yml
    title: Build and deploy workflow
  - id: sync-workflow
    resource: ../.github/workflows/github-repositories.yml
    title: Scheduled GitHub directory refresh
  - id: split
    resource: ../scripts/split-content.mjs
    title: Reviewed shape-change procedure
  - id: smoke
    resource: ../scripts/smoke-dist.mjs
    title: Browser smoke test of the built site
  - id: thumbnails
    resource: ../scripts/prepare-media-thumbnails.py
    title: Gallery thumbnail preparation
  - id: health
    resource: ../scripts/portfolio-health.mjs
    title: Editorial completeness summary
  - id: editor
    resource: ../docs/EDITOR.md
    title: Owner editing guide
---

# Local setup

Use Node 24 or later. `npm install` installs Astro and the Playwright dev dependency; `npx playwright install chromium` adds the browser that `npm run smoke` needs. `npm run dev` composes content and starts the Astro authoring server, which does not run the post-build step (no CV PDFs, legacy stubs or CSP metas). `npm start` previews the built `dist/` at `http://127.0.0.1:4322/`. `npm run smoke` is the closest local stand-in for Pages serving.[^scripts]

# Validation

| Command | What it proves |
| --- | --- |
| `npm run compose` | Writes `src/data/content.json` from `content/`; fails with editor paths on invalid content. |
| `npm run check` | Content contract and `.pages.yml` freshness, without writing. |
| `npm test` | Node test suite in `scripts/tests/` (compose and split, Pages CMS config, collections, post-build step, GitHub sync, content visibility, portfolio health). |
| `npm run build` | Compose, `astro build`, `prepare-pages.mjs`; prints a build summary with CV hashes. |
| `npm run smoke` | Serves `dist/` like Pages (directory index, `/dir` → `/dir/`, `404.html` with status 404) and drives every route in headless Chromium: legacy stubs and query links, a retired ID, the 404 page, copy-email, gallery filters, lightbox and video dialog, project explorer, `/code/` filters, the 375 px menu, three no-JavaScript pages, and zero console errors, CSP violations or failed requests. |

CI runs `check`, `test` and `build` before every deploy; `smoke` is a local gate. The deploy workflow also writes a non-blocking editorial completeness summary (`scripts/portfolio-health.mjs`), which counts filled fields and never validates claims.[^deploy][^health]

For UI changes also check keyboard use, narrow screens, reduced motion, no-JavaScript reading, native media controls and print output. Performance or SEO claims need fresh, dated evidence.

# Release and rollback

- **Release = merge to `main`.** Every commit on `main` (a merged maintainer branch, a Pages CMS save or a snapshot commit from the sync workflow) builds and deploys. Work on a branch, run the validation commands, then merge. A branch push or manual run on another ref builds but never deploys.
- **Rollback = `git revert`.** Revert the offending commit on `main` and push; the revert deploys like any other commit. Do not force-push `main`: Pages CMS and the sync workflow commit to it. Owner text can also be restored by copying the earlier value from the file history in Pages CMS.
- Report build, local validation, deployment and live verification as separate states. A passing local build is not a deployment.

# Maintainer procedures

- **Shape changes** (new field, project, list item, route or asset): follow the numbered steps in the header of `scripts/split-content.mjs`, label new fields in `content/labels.json`, run `npm run pages-config`, and confirm `npm run compose` reproduces the reviewed content byte for byte.[^split]
- **Media:** add reviewed copies under `public/assets/`, never raw source media. After adding project photos or posters run `npm run compose` and then `python3 scripts/prepare-media-thumbnails.py` (needs Pillow) and commit the thumbnails and `src/data/media-thumbnails.json`.[^thumbnails]
- **GitHub directory:** review new repositories in `src/data/repository-overrides.json` (description, purpose, related cases, keyed by repository ID). The owner cannot edit this file in Pages CMS. A failed sync keeps the last snapshot; check the workflow's job summary.[^sync-workflow]
- **Owner questions** are answered from [the editing guide](../docs/EDITOR.md).[^editor]

# Repository settings (owner account)

Set by the `sinashiry` account, since a collaborator cannot change them:

- Pages source: **GitHub Actions** (never "Deploy from a branch", which would publish the repository itself).
- The `github-pages` environment limited to `main`.
- Domain verification for `sina-shiri.com` (TXT record `_github-pages-challenge-sinashiry`), then the custom domain `sina-shiri.com` and **Enforce HTTPS** once the certificate is issued. No `CNAME` file is needed for Actions deploys.
- Pages CMS installed for this repository only. If `main` is protected, Pages CMS and the sync workflow must still be able to push to it.

# DNS cutover checklist

1. Freeze edits on the previous site and confirm its content matches this repository.
2. Lower the TTLs of the records that will change about an hour in advance.
3. Verify the domain and add the custom domain in the repository settings before changing DNS.
4. Point the apex at GitHub Pages: A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` and AAAA records `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.
5. Replace the `www` record with a CNAME to `sinashiry.github.io.`; Pages redirects `www` to the apex.
6. Keep every mail record unchanged: MX, SPF, DMARC and the mail service host names, written as explicit records. Never point a wildcard record at GitHub. If the mail server's certificate also covers the apex or `www`, reissue it for the mail names only so its renewal does not fail after the move.
7. Wait for the Pages certificate, then enable Enforce HTTPS. Visitors whose browsers cached HSTS from the previous host see TLS errors until it is issued, so keep this window short.
8. Read back the live site: every route, legacy links, CV downloads and `/code/`. Record the result in [status](./status.md).
9. Verify the domain in Search Console by DNS TXT and resubmit `sitemap.xml`.
10. Retire the previous host's web content, scheduled jobs and backups once the new site is confirmed, keeping mail service as long as it is needed.

[^scripts]: npm scripts and engine requirement.
[^deploy]: CI gate and deploy job.
[^health]: Content-only completeness summary.
[^split]: Reviewed shape-change steps.
[^thumbnails]: Thumbnail generation from reviewed assets.
[^sync-workflow]: Schedule, commit rule and redeploy dispatch.
[^editor]: Owner-facing editing, CV replacement and undo steps.
