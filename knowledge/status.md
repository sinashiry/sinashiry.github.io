---
type: Project Status
title: Current state and remaining work
description: Live on GitHub Pages at sina-shiri.com since 13 October 2026, verified by production readback.
tags: [status, validation, next-steps]
status: stable
generated:
  by: claude-code/claude-opus-5.5
  at: "2026-10-13T15:50:00Z"
sources:
  - id: scripts
    resource: ../package.json
    title: Validation commands
  - id: prepare
    resource: ../scripts/prepare-pages.mjs
    title: Post-build step and build summary
  - id: smoke
    resource: ../scripts/smoke-dist.mjs
    title: Browser smoke test
  - id: deploy
    resource: ../.github/workflows/pages.yml
    title: Deploy workflow
  - id: sync
    resource: ../.github/workflows/github-repositories.yml
    title: Scheduled GitHub directory refresh
---

# State on 13 October 2026

**Live on GitHub Pages.** `https://sina-shiri.com/` is served from this repository's `main` branch by the deploy workflow.[^deploy] The previous host no longer serves the website; it still hosts the domain's mail.

- **DNS:** managed in Cloudflare with every record set to DNS only (no proxy). The apex has the four GitHub Pages A and AAAA records, `www` is a CNAME to `sinashiry.github.io`, and the `_github-pages-challenge-sinashiry` TXT record keeps the domain verified on the owner account. Mail records (MX, SPF, DMARC and the mail host names) still point to the mail host and must stay unchanged.
- **HTTPS:** GitHub issued the Pages certificate for `sina-shiri.com` and `www.sina-shiri.com` (renewed automatically) and Enforce HTTPS is on. HTTP and `www` redirect to `https://sina-shiri.com/` with 301.
- **Workflows:** the deploy workflow and the scheduled GitHub directory refresh have both run successfully on GitHub. The refresh commits only when repository data changes or weekly as a heartbeat, then dispatches a redeploy.[^sync]

# Production readback (13 October 2026)

- Every one of the 369 built files was requested from GitHub Pages over HTTPS for `sina-shiri.com` with certificate validation. All returned 200: text files matched the local build of the same commit byte for byte (SHA-256), and media files matched by size.[^prepare]
- `www` → apex 301, HTTP → HTTPS 301, a missing page → 404 with the custom page, legacy project links and `?p=` query links reach their targets, and the legacy CV address serves the Engineering CV.
- A browser check of the `github.io` preview showed no console errors and a working `?p=41` → `/resume/` redirect.
- Mail service answered on its TLS ports after the move.

# Local verification

- `npm run check`, `npm test` (103 tests), `npm run build` and `npm run smoke` pass.[^scripts][^smoke]
- Before release the build was compared with a production-equivalent build of the previous site and a public readback of it: no unexpected differences. Expected differences are email-only contact, the rewritten privacy page, the removed statistics note, CSP and referrer metas, the `/admin/` entrance page, 15 legacy stubs, `/code/` listing every public repository, `twitter:title` keeping its suffix, live empty-state wording for Blog and Publications, and one unreferenced old photograph removed.

# Known limitations

- Pages cannot send HSTS, `frame-ancestors`/X-Frame-Options, nosniff, Permissions-Policy or cache headers; redirects are client-side and retired WordPress URLs return 404.
- CV PDFs exist only in the build output, so `astro dev` does not serve them.
- Slug permanence relies on Pages CMS disabling rename and delete; there is no CI check against previously published URLs.

# Next steps

1. Owner: install Pages CMS for this repository only and confirm one real save deploys (see [the editing guide](../docs/EDITOR.md)).
2. Reissue the mail host's certificate for the mail names only, since it also covered the apex and `www`, so its next renewal does not fail.
3. Retire the previous host's web content, scheduled jobs and backups, keeping mail service as long as it is needed.
4. Verify the domain in Search Console by DNS TXT and resubmit `sitemap.xml`.
5. Optional: add a CI check that published blog and paper URLs never disappear.

[^scripts]: Commands as defined in `package.json`.
[^prepare]: Build summary printed by the post-build step.
[^smoke]: Local stand-in for Pages serving.
[^deploy]: Deploy workflow on push to `main`.
[^sync]: Six-hourly refresh with a weekly heartbeat.
