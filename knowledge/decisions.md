---
type: Architecture Decision Record
title: Architecture and evidence decisions
description: Reasons for the static Pages stack, the editing and privacy model, and the evidence boundaries for public claims.
tags: [decisions, privacy, content]
status: stable
generated:
  by: claude-code/claude-opus-5.5
  at: "2026-10-11T21:45:00Z"
sources:
  - id: deploy
    resource: ../.github/workflows/pages.yml
    title: Build and deploy workflow
  - id: contract
    resource: ../content/contract.json
    title: Editable field rules
  - id: prepare
    resource: ../scripts/prepare-pages.mjs
    title: Post-build public transforms and guards
  - id: legacy
    resource: ../scripts/legacy-redirects.mjs
    title: Legacy WordPress URL map
  - id: collections
    resource: ../src/lib/collection-rules.ts
    title: Build-time blog and paper rules
  - id: sync
    resource: ../scripts/sync-github.mjs
    title: Scheduled repository snapshot
  - id: privacy
    resource: ../src/pages/privacy.astro
    title: Public privacy statement
  - id: covers
    resource: ../docs/project-cover-provenance.md
    title: Generated project cover provenance
---

# Platform decisions

| Decision | Reason and consequence |
| --- | --- |
| Static Astro build on GitHub Pages | Static delivery suits a CV and needs no server to maintain. The workflow builds from Git and deploys only `dist/`; the domain is served at the root, so every URL is root-absolute.[^deploy] |
| Pages CMS editing in a public repository | The owner edits text, CVs, posts and papers without a server. Every save is a public commit, so drafts, unapproved recommendations, referee slots and uploads are public in Git history; this was accepted. Shape and locked fields stay maintainer-reviewed in `content/structure.json` and `content/contract.json`.[^contract] |
| Fixed shape with allowlisted text fields | Editing stays useful without arbitrary markup, routing, asset paths or executable content. Shape changes go through the reviewed split procedure. |
| Contact by email only | No form backend, third-party form service or stored messages. Topic cards are `mailto:` links with a subject; the copy-email button stays. |
| No analytics | No visit statistics, cookies, browser storage or geolocation data. The privacy page describes static hosting and GitHub's own request logging.[^privacy] |
| Blog and Publications rendered at build time | Content collections with file name = permanent slug, the 3-post and 1-paper thresholds, `noindex,follow` below them and an escaped Markdown subset. A published entry changes on the next deploy; there is no separate published snapshot.[^collections] |
| Scheduled GitHub directory refresh in Actions | The snapshot is committed only on a data change or a weekly heartbeat, then the deploy is dispatched. The site repository is listed with a reviewed entry and its own timestamps are ignored, so it cannot cause a commit loop.[^sync] |
| Legacy WordPress URLs as static stubs | Pages cannot send 301 or 410 responses: 15 meta-refresh/JavaScript stubs, a query-ID hook on `/` and `404.html`, and a build-time copy of the legacy CV URL. Retired URLs return 404.[^legacy] |
| Meta CSP and referrer policy | Hash-based script policy computed over the final HTML. Headers that cannot be expressed as meta tags (HSTS, framing, nosniff, Permissions-Policy, cache control) are not available on Pages; this loss was accepted.[^prepare] |
| Small progressive enhancements and native controls | Static content, keyboard access, reduced motion and usable media work without a client framework or JavaScript. |
| One screen-only dark theme layer | Styling stays maintainable while print output remains light. |
| Shared gallery derived from project media | No second catalogue with divergent captions; source URLs are deduplicated and project associations kept. |

# Editorial and evidence boundaries

- **Sources of claims.** Public claims come from reviewed content, source evidence and explicit owner corrections. Do not invent ranks, certifications, affiliations, research results, measurements, publication acceptance, papers, qualifications or endorsements. When sources disagree, do not resolve the conflict by inventing a value.
- **Employment and research.** IstaSanat employment is owner-confirmed as 2017–present. The current freelance hardware-security research is a description of work, not evidence of an affiliation, named method, result or accepted paper.
- **Credit and grades.** Preserve collaborator credit, sourced co-authorship and original GPA scales.
- **Trading.** Keep trading material out of the curated CV and project narrative. The separate GitHub directory lists every public repository at the owner's request, including unrelated repositories, forks and archives, labelled honestly.
- **Recommendations and references.** Only authentic, approved text is published. A recommendation card needs `approved = yes` plus a quote, name and professional status; a reference needs approval plus name, current role and relationship; an academic profile needs a label and an HTTPS link. Incomplete entries are removed from the HTML, and a group with no ready entry is omitted entirely. Empty templates are not testimonials, and no account, person or link is inferred. Current research appears only with both a question and a contribution.
- **Optional project fields.** `measuredOutcome` records a supplied measurement with its conditions; `referenceUrl` is an optional project-specific HTTPS link. Neither is inferred from other text.
- **Generated imagery.** The homepage features four reviewed cases with covers from one AI illustration family. Covers and the aerial concept image are labelled as illustrations and never presented as photographs, prototypes or results; real photographs, diagrams and videos stay on the case-study pages.[^covers]
- **Media privacy.** Public media are reviewed copies with privacy masks and trims; videos are silent.
- **Repository metadata.** GitHub descriptions, languages and dates are account metadata, not evidence of ownership, reproduction or results. Public copy comes from reviewed overrides.
- **CVs.** PDFs and LaTeX sources are separate artifacts; web text edits update neither.

See [architecture](./architecture.md) for the implementation and [status](./status.md) for pending work. Revisit a decision only when requirements or evidence change, and record the reason.

[^deploy]: Build, test and deploy gate.
[^contract]: Locked versus editable fields.
[^privacy]: No analytics, cookies or third-party scripts.
[^collections]: Thresholds, visibility states and escaped rendering.
[^sync]: Write rule, heartbeat and loop guard.
[^legacy]: Verified legacy URL set.
[^prepare]: CSP hashing and deploy guards.
[^covers]: Cover generation method and labelling rule.
