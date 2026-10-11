---
type: Project Status
title: Current state and remaining work
description: GitHub Pages build verified locally on 11 October 2026; not yet deployed; DNS cutover pending.
tags: [status, validation, next-steps]
status: stable
generated:
  by: claude-code/claude-opus-5.5
  at: "2026-10-11T21:45:00Z"
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
    title: Deploy workflow, not yet run on GitHub
---

# State on 11 October 2026

**Built and verified locally only. Not yet deployed.** This source has not run on GitHub, and `sina-shiri.com` is still served by the previous host. The DNS cutover is pending. Do not describe the site as live on GitHub Pages until a production readback has been recorded here.

# Local verification (11 October 2026)

- `npm run compose` and `npm run check` pass with 933 editable fields, and `.pages.yml` is current.[^scripts]
- `npm test` passes all 103 Node tests.
- `npm run build` produces 38 HTML pages (21 routes, `404.html`, the `/admin/` entrance page and 15 legacy stubs) and 369 files (216.3 MiB), with a per-page CSP over 15 distinct inline-script hashes.[^prepare]
- `npm run smoke` passes in headless Chromium: 37 HTML routes including the 15 stubs, legacy query links, a retired ID, the 404 page, the interactive features and three no-JavaScript pages, with no console errors, CSP violations or failed requests.[^smoke]
- **Parity.** The build was compared with a production-equivalent build of the previous site (8 October 2026) and a public readback of the live site (11 October 2026). After normalisation there were no unexpected differences. The expected ones are:
  - contact by email and the rewritten privacy page;
  - the removed footer statistics note;
  - contact links retargeted to `/contact/#write-to-sina`;
  - CSP and referrer metas;
  - the `/admin/` page and the 15 stubs;
  - `/code/` listing 10 repositories;
  - `twitter:title` keeping its " — Sina Shiri" suffix;
  - Blog and Publications empty states worded as on the live site;
  - one unreferenced old photograph removed from the public assets.
- `sitemap.xml` (19 URLs) is identical to the previous site, and `sitemap-collections.xml` matches live. Every other carried-over asset, media file and LaTeX source is byte-identical, and both CV PDFs keep their hashes.

**Not yet verified:** the two workflows on GitHub, Pages CMS against the real repository, the custom domain and HTTPS, and live behaviour on Pages.[^deploy]

# Known limitations

- Pages cannot send HSTS, `frame-ancestors`/X-Frame-Options, nosniff, Permissions-Policy or cache headers; redirects are client-side and retired WordPress URLs return 404.
- CV PDFs exist only in the build output, so `astro dev` does not serve them.
- Slug permanence relies on Pages CMS disabling rename and delete; there is no CI check against previously published URLs.

# Next steps

1. Publish this tree as the first commit of `sinashiry/sinashiry.github.io`.
2. Apply the repository settings in [operations](./operations.md#repository-settings-owner-account), then confirm the first deploy and a Pages CMS save on the `github.io` address.
3. Freeze edits on the previous site and confirm its content still matches this repository.
4. Run the [DNS cutover checklist](./operations.md#dns-cutover-checklist), keeping every mail record.
5. Read back the live site and record the result here.
6. Optional: add a CI check that published blog and paper URLs never disappear.

[^scripts]: Commands as defined in `package.json`.
[^prepare]: Build summary printed by the post-build step.
[^smoke]: Local stand-in for Pages serving; not evidence about the production host.
[^deploy]: The deploy workflow has not run yet.
