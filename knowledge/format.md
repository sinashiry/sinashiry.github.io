---
type: Reference
title: Open Knowledge Format version and conventions
description: Pinned official OKF version and maintenance conventions.
tags: [knowledge, okf, provenance]
status: stable
generated:
  by: codex/gpt-6
  at: "2026-10-07T13:13:58Z"
sources:
  - id: okf
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107c31c06aec8a7d5636e0d1058118604e6f/SPEC.md
    title: Official Open Knowledge Format v0.2 specification
---

# Pinned format

The official GoogleCloudPlatform repository's `main` resolved on 7 October 2026 to commit `ad30107c31c06aec8a7d5636e0d1058118604e6f` (21 August 2026). Its specification is **OKF v0.2**. This bundle uses that exact [specification](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107c31c06aec8a7d5636e0d1058118604e6f/SPEC.md), rather than an unpinned README summary.[^okf]

`knowledge/` is the bundle root; the specification allows a bundle to be a repository subdirectory. The root `index.md` declares `okf_version: "0.2"` and lists the concepts. Every other concept has YAML frontmatter with a nonempty `type`, a title/description, lifecycle status, generation timestamp and source pointers. Links between concepts are relative Markdown paths. All timestamps include an explicit UTC offset.[^okf]

No `verified` field is claimed merely because an agent authored a file. Add verification only with a real check and appropriate actor; human review must identify actual human review. No source credibility scores or fictional provenance are recorded. Lifecycle status describes the maturity of the recorded knowledge; pending implementation work belongs in the status concept.[^okf]

# Maintenance

Keep this bundle small: update the relevant concept and index description when a contract changes. Store exact source paths and sanitized evidence scope; exclude credentials, visitor rows, transient conversations and duplicate reports. Git supplies change history; an extra chronological log is unnecessary here. Do not install or execute upstream reference-agent code to maintain these Markdown files.

[^okf]: Official spec at the pinned commit; fetched directly from the official repository for this update.
