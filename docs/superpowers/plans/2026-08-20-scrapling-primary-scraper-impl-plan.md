# Implementation Plan — Scrapling as primary scraper

## Section 1 — Summary

```
Feature: Add Scrapling as the primary scraping tool ahead of Crawl4AI/Firecrawl
Date: 2026-08-20
App: GlobalyApp-v3 backend, data-extraction module
Spec: none — no gh-architecture-docs spec/PRD/design-direction exists for this.
      This is an infra/tooling swap inside an existing module, not a new
      product feature, so this plan skips straight from the raw ask to a
      plan. Flagging the gap rather than silently skipping it.
Mode: ENHANCEMENT (delta to lib/scraper.ts's existing Crawl4AI→Firecrawl cascade)

In scope:
- A small self-hosted Scrapling HTTP wrapper service (Python; Scrapling has
  no Node/TS bindings) with its own internal anti-bot escalation.
- New cascade in scrapeMarkdown(): Scrapling → Crawl4AI → Firecrawl.
- New cascade in scrapeRenderedHtml(): Scrapling → Firecrawl (agent-table
  HTML parsing / provider detection, currently Firecrawl-only). Folded in
  because the wrapper service already returns `html` alongside `markdown`
  from whichever tier succeeded — this is a second call site, not new
  service logic.
- Config plumbing (SCRAPLING_BASE_URL / SCRAPLING_API_KEY) mirroring the
  existing CRAWL4AI_* pattern.
- No changes required in callers (extraction-job/page/verify workers, or
  the step worker's agent-table parsing) — they only call scrapeMarkdown()/
  scrapeRenderedHtml(), which keep the same signatures.

Out of scope (explicit):
- The extraction-step.worker.ts wrong-table-name bug (deferred by user).
- URL discovery (discoverUrlsForCrawl) — Scrapling has no sitemap/map
  endpoint, same as Crawl4AI today. Discovery cascade (Firecrawl /map →
  sitemap → homepage links) is unaffected.
- Any change to how CRAWL4AI_BASE_URL/FIRECRAWL_API_KEY are deployed today.
```

**Conflict flagged:** the module's own `CLAUDE.md` states a hard "parity-first"
rule — *"No new features. Extraction module is a parity port... new
capabilities go in separate PRs after parity is confirmed."* Adding a third
scraper tier that didn't exist in V2 is, by that rule's letter, a new
capability. Proceeding since you've explicitly asked for it, but Section 2
includes a one-line `CLAUDE.md` update to record the exception so a future
reader (or future me) doesn't flag this as an accidental parity violation.

---

## Section 2 — File Map

```
CREATE
  devops/docker/scrapling-service/main.py         — FastAPI wrapper, POST /scrape + GET /health
  devops/docker/scrapling-service/requirements.txt — scrapling[fetchers], fastapi, uvicorn
  devops/docker/scrapling-service/Dockerfile       — python:3.12-slim + `scrapling install` (Camoufox/Playwright browsers)
  devops/docker/scrapling-service/README.md        — how to run/deploy it standalone (same shape as Crawl4AI's own deployment — Crawl4AI isn't provisioned by this repo's docker-compose either, it's just an external URL+key)

MODIFY
  backend/src/config.ts                                                — add SCRAPLING_BASE_URL / SCRAPLING_API_KEY (next to CRAWL4AI_* at line 54-56)
  backend/src/modules/superadmin/data-extraction/lib/scraper.ts        — add getScraplingConfig() + scraplingScrape(), reorder scrapeMarkdown()'s cascade, extend ScrapeResult.scraper union to include "scrapling"; also reorder scrapeRenderedHtml() (line 221-240) to try Scrapling (requesting html) before Firecrawl
  .env.example                                                          — add SCRAPLING_BASE_URL / SCRAPLING_API_KEY placeholders next to the existing CRAWL4AI_* lines
  backend/src/modules/superadmin/data-extraction/README.md              — update the pipeline diagram / cascade description (already known-stale from an earlier audit — same lines being touched, cheap to fix now)
  backend/src/modules/superadmin/data-extraction/CLAUDE.md              — one line under "Parity-first rules" noting Scrapling as an explicit, approved exception

CONFIRM BEFORE CREATING
  devops/docker/scrapling-service/  — placement is tentative. Chosen to mirror
  the existing devops/docker/troubleshooter/ precedent (the only other
  Dockerized non-Node service in this repo). Alternative: a repo-root
  services/scrapling/ directory. Troubleshooter is a one-off maintenance
  tool, not a long-running service, so devops/docker/ may not be the right
  home for something that runs continuously in production — confirm before
  I create it.
```

---

## Section 3 — Scrapling service design (the actual mechanism)

**Why a separate service at all:** Scrapling is Python-only (no Node/TS
bindings, no CLI-over-stdio mode worth shelling out to per-request). The
backend already talks to Crawl4AI the same way — a self-hosted HTTP service
reached by `CRAWL4AI_BASE_URL` — so this repeats an existing, working
integration shape rather than inventing a new one.

**Internal anti-bot cascade (inside the Python service, not in Node):**
Scrapling's own docs give three fetcher tiers of increasing cost. The wrapper
tries them cheapest-first and only escalates on a block, exactly like the
existing Crawl4AI fit→raw escalation in `scraper.ts`:

1. `Fetcher.get(url, impersonate="chrome")` — plain HTTP + TLS fingerprint
   impersonation. Cheap, no browser. Good enough for ~most sites.
2. If response is short (<200 chars, same `MIN_CONTENT_LEN` threshold the
   Node side already uses) or status is 403/503/a Cloudflare challenge page:
   escalate to `StealthyFetcher.fetch(url, headless=True, network_idle=True,
   solve_cloudflare=True)` — this is the tier that actually solves Cloudflare
   Turnstile per Scrapling's docs.
3. If still short after that (rare — JS-rendered content that needs more
   than Cloudflare-solving): `DynamicFetcher` (full Playwright Chromium) as
   the last internal resort.

Response returned to Node: `{ markdown, html, tier_used, blocked, error }`.
`markdown` comes from Scrapling's own HTML→text extraction on whichever
tier succeeded (mirrors what Crawl4AI returns today). `html` is the raw
rendered DOM from whichever tier ran — one endpoint serves both
`scrapeMarkdown()` (reads `.markdown`) and `scrapeRenderedHtml()` (reads
`.html`), so there's no second service endpoint to build.

**Auth:** shared-secret header (`X-API-Key`, matching Crawl4AI's own
header names) checked against `SCRAPLING_API_KEY` — this is our own service,
we define the contract.

**Timeouts:** each tier gets its own budget inside the service (10s /
25s / 30s) so a hung browser tier doesn't block the whole request
indefinitely; Node's fetch to the service gets an overall ~40s timeout so a
fully-stuck Scrapling instance still cascades to Crawl4AI instead of hanging
the page worker.

---

## Section 4 — Backend Track (Node side)

```
[ ] config.ts: add
      SCRAPLING_BASE_URL: z.string().optional(),  // e.g. https://your-scrapling.railway.app
      SCRAPLING_API_KEY: z.string().optional(),
    directly under the existing CRAWL4AI_* block (line 54-56), same comment style.

[ ] scraper.ts:
    - getScraplingConfig() — same shape as getCrawl4aiConfig() (line 128-134):
      returns null if SCRAPLING_BASE_URL unset, else { baseUrl, apiKey }.
    - scraplingScrape(url, cfg) — POST {baseUrl}/scrape, header X-API-Key if
      set, body { url }. Returns { markdown, error }. Same shape/error
      handling as crawl4aiScrape() (try/catch → { markdown: "", error }).
    - scrapeMarkdown() cascade reorder (currently lines 248-288):
        Path 0 (NEW): Scrapling, if configured and !opts.forceFirecrawl
          → if markdown.length >= MIN_CONTENT_LEN, return scraper: "scrapling"
          → else fall through to existing Path A (Crawl4AI)
        Path A: Crawl4AI (unchanged, lines 253-279)
        Path B: Firecrawl-only (unchanged, lines 282-285)
      `opts.forceFirecrawl` keeps its existing meaning (skip straight to
      Firecrawl) — used today by the page worker's anti-bot retry logic.
      Since Scrapling now handles anti-bot itself, that retry path may
      become partly redundant; NOT touching extraction-page.worker.ts's
      retry logic in this plan (flagged as open question, not silently
      changed).
    - ScrapeResult.scraper type (line 24): "crawl4ai" | "firecrawl" | "none"
      → add "scrapling".
    - Update the file's top comment (line 1) and the scrapeMarkdown() docblock
      (line 244-247) to describe the new 3-tier cascade.
    - scrapeRenderedHtml() (currently lines 221-240, Firecrawl-only): add a
      Path 0 that calls the same Scrapling `/scrape` endpoint (its `html`
      field), falling back to the existing Firecrawl rawHtml call if
      Scrapling isn't configured or returns short/empty. No signature
      change — still returns `{ html, error }`. Callers (the step worker's
      agent-table parser / provider detector) need no changes.

[ ] .env.example: add SCRAPLING_BASE_URL / SCRAPLING_API_KEY next to the
    CRAWL4AI_* lines, with the same self-hosted framing.

[ ] data-extraction/README.md: update the cascade diagram/table (the parts
    already flagged stale — "Crawl4AI (self-hosted, primary)" section and
    the ASCII pipeline diagram) to show Scrapling → Crawl4AI → Firecrawl.

[ ] data-extraction/CLAUDE.md: append one bullet under "Parity-first rules"
    — "Exception: Scrapling was added ahead of Crawl4AI in the scrape
    cascade (2026-08-20) as an explicit, approved deviation from parity —
    not a V2 behavior."
```

No changes needed in `extraction-job.worker.ts`, `extraction-page.worker.ts`,
`extraction-verify.worker.ts`, or the step worker's agent-table parsing —
all consume `scrapeMarkdown()`/`scrapeRenderedHtml()` by their existing
return shape and don't inspect `result.scraper` for branching logic
(confirmed by grep — it's only read for logging/`extraction_job_events`).

---

## Section 5 — Frontend Track

Not applicable. No UI surface changes — `result.scraper` already flows into
`extraction_job_events` and any admin UI showing "scraper used" per job will
just start showing a new string value ("scrapling") with no code change.
`scrapeRenderedHtml()`'s return shape is unchanged (`{ html, error }`), so
this holds for its call sites too.

---

## Section 6 — Test Plan

No test runner exists in `backend/package.json` today (no vitest/jest) —
not introducing one for this alone.

```
[ ] Tracer check (per ponytail: one runnable check for the new branch logic):
    a small `scripts/check-scraper-cascade.ts` (or a `__main__`-style block
    at the bottom of scraper.ts under `if (import.meta.url === ...)`) that
    mocks fetch to return short/long responses per tier and asserts
    scrapeMarkdown() picks scrapling → crawl4ai → firecrawl in the right
    order and stops at the first tier that clears MIN_CONTENT_LEN.
[ ] Manual smoke test once the Python service is deployed:
    curl -X POST $SCRAPLING_BASE_URL/scrape -H "X-API-Key: $KEY" \
      -d '{"url":"https://nopecha.com/demo/cloudflare"}'
    — confirms the Cloudflare-solving tier actually works before wiring
    it into the live pipeline.
[ ] One real job run against a known-anti-bot institution site (pick one
    from `extraction_job_events` history that previously fell through to
    Firecrawl) to confirm it now resolves at the Scrapling tier.
```

---

## Section 7 — Risk & Rollback

```
Risks:
- Scrapling's browser tiers (StealthyFetcher/DynamicFetcher) are slow and
  resource-heavy compared to Crawl4AI's markdown-only calls → mitigation:
  internal cheap-first cascade (Fetcher before StealthyFetcher) + hard
  per-tier timeouts, so cost only shows up on sites that actually need it.
- New always-on Python service is one more thing to deploy/monitor →
  mitigation: SCRAPLING_BASE_URL is optional, exactly like CRAWL4AI_BASE_URL
  — unset it and the cascade silently falls back to today's Crawl4AI→Firecrawl
  behavior with zero code changes needed.
- Parity-first rule violation (see Section 1) → mitigation: documented
  explicitly in CLAUDE.md rather than silently drifting from stated
  convention.
- Camoufox/Playwright browser download at Docker build time can be large/slow
  → mitigation: pin exact Scrapling version in requirements.txt, build once,
  reuse the image.

Rollback:
- Unset SCRAPLING_BASE_URL — scrapeMarkdown() falls through to the existing
  Crawl4AI→Firecrawl path unchanged (Path A/B are untouched, just renumbered).
- No DB/migration involved, nothing to reverse there.
```

---

## Section 8 — Open Questions

```
[ ] devops/docker/scrapling-service/ vs a repo-root services/ directory —
    which convention do you want for a long-running non-Node service? — owner: you
[ ] Now that Scrapling handles Cloudflare/anti-bot itself, should
    extraction-page.worker.ts's existing "retry via Firecrawl browser-render
    then mobile-emulation" block be simplified/removed, or left alone for
    now and revisited later? — owner: you
[ ] Where will the Scrapling service actually be hosted (Railway, like
    Crawl4AI, or elsewhere)? Not a blocker for writing the code, but affects
    the README's deployment instructions. — owner: you
[ ] Confirm you're OK with the explicit CLAUDE.md parity-rule exception note,
    or would you rather that stay unwritten? — owner: you
```

---

Plan saved → `docs/superpowers/plans/2026-08-20-scrapling-primary-scraper-impl-plan.md`

Open questions above must be resolved before implementation starts (or tell me to default them and I will).

Type **"approved"** to hand off to implementation, or tell me what to change.
