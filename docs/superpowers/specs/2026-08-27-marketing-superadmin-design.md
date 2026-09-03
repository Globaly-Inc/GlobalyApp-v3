# Marketing in Super Admin — Blogs (AI), Guides, SEO/AEO, Subscribers

**Date:** 2026-08-27
**Branch:** `dev-feat-marketing-superadmin`
**Status:** Approved in design review (chat), pending spec review

## Goal

Expand Super Admin → Marketing from one item (Blog) to four: **Blogs** (adds AI
generation), **Guides** (lead-gen landing pages), **SEO/AEO** (keyword rankings +
action plan), **Subscribers** (unified lead list). Public site gains guide landing
pages and visible blog view counts.

## Decisions made in review

| Question | Decision |
|---|---|
| Cover image generation | Backend calls the Higgsfield HTTP API directly (new `HIGGSFIELD_API_KEY` env var). No MCP at runtime. |
| SEO ranking data source | Google Search Console API. GSC is **not yet set up** — page ships with a "not connected" onboarding state and setup docs. |
| AEO | v1 is a readiness score computed from our own pages, not live citation tracking (no API exists). |
| Menu | Marketing → Blogs (rename of Blog), Guides, SEO/AEO, Subscribers. Ads stays commented out. |
| Review workflow | Reuse `is_published`. AI drafts land unpublished with a badge; edit → publish is the approval. No new status machine. |
| Guide PDF delivery | Email with a ~7-day signed GCS link. Never downloadable from the page. |

## What already exists (reuse, don't rebuild)

- **Admin blog module**: `frontend/src/app/admin/marketing/blog/` — listing, rich
  editor, SEO panel, keywords manager. Backend:
  `backend/src/modules/superadmin/marketing/blog/` (+ public routes in
  `backend/src/modules/blog/`).
- **Schema**: `superadmin.blog_posts` already has `views`, `is_published`,
  `category` (topic), `country_focus`, `focus_keyword`, `seo_score`, `meta_title`,
  `meta_description`, `og_image_url`. `superadmin.blog_keywords` exists.
  `posts.repository.ts:78` already increments `views` on public reads.
- **AI infra**: `backend/src/shared/ai/gemini.ts`; AI counsellor knowledge base +
  embeddings in `backend/src/modules/ai-counsellor/repositories/knowledge.repository.ts`.
- **Job infra**: LavinMQ + 15 existing `job:*` worker scripts in `package.json`.
- **Leads**: `globalyapp.waitlist_registrations` (name, email, registrant_type)
  captures newsletter + early-interest signups.
- **Uploads**: GCS with signed URLs (`GCS_*` env vars).
- **Mail**: `backend/src/shared/mail/templates.ts` + email worker pattern.

## 1. Navigation

`frontend/src/app/admin/nav-config.ts` Marketing group:

```
Marketing
├─ Blogs        → /admin/marketing/blog        (rename label only; route unchanged)
├─ Guides       → /admin/marketing/guides      (new)
├─ SEO/AEO      → /admin/marketing/seo         (new)
└─ Subscribers  → /admin/marketing/subscribers (new)
```

## 2. Blogs — AI generation

### UX

"Generate with AI" button on the Blogs page opens a dialog: keywords (pick from
`blog_keywords` or free text), context textarea, count 1–5, optional topic +
country targeting. Submitting shows a progress panel (per-blog
pending/running/done/failed) that polls job status.

### Pipeline

New table `superadmin.blog_generation_jobs`: id, status
(`pending|running|done|failed`), keywords jsonb, context text, topic, country,
`blog_post_id` FK nullable, error text, timestamps. One row per requested blog.

New worker `job:blog-generate` (LavinMQ, same pattern as existing workers):

1. **Context retrieval** — embeddings search over the AI counsellor knowledge base
   using the keywords, so articles draw on the education-industry corpus.
2. **Article generation** — Gemini structured prompt enforcing the SEO contract:
   - H1/H2/H3 hierarchy; focus keyword in H1, first paragraph, and ≥1 H2.
   - `meta_title` ≤ 60 chars, `meta_description` ≤ 155 chars.
   - FAQ section (3–5 Q&As) for AEO.
   - JSON-LD `Article` + `FAQPage` embedded in content.
   - Reading time computed and stored.
   - **Internal links**: prompt receives a manifest of live URLs (published blog
     slugs + country pages) and may link ONLY from that list — no hallucinated 404s.
   - **External links**: authoritative domains only (gov/edu/official statistics),
     `rel="noopener"`.
3. **Cover image** — Higgsfield HTTP API → download → upload to GCS → set
   `cover_image_url` + `og_image_url`. A cover failure does NOT fail the blog; the
   draft saves coverless and the job row notes it.
4. **Insert** into `blog_posts` as unpublished draft with `generated_by_ai = true`.

Review = the existing edit → publish flow. The badge "AI generated — needs review"
renders on unpublished AI drafts.

### Migration (append-only)

One new **superadmin** migration file (both tables live in the superadmin
schema, matching the existing blog migration) adding:
- `superadmin.blog_generation_jobs` (above)
- `blog_posts.generated_by_ai boolean not null default false`

### Env

- `HIGGSFIELD_API_KEY` (backend). User must obtain this key; worker fails the
  cover step gracefully if unset.

## 3. Blogs — filters & views

Filter bar order (left → right), rebuilt in `blog-view.tsx`:
1. Search bar (existing)
2. Publish filter — existing all/drafts/published tabs become a compact select
3. Topic dropdown (existing segmented tabs → dropdown)
4. Country dropdown (existing combobox)
5. Most popular — sort toggle: newest (default) ↔ most viewed. Client-side.

Views display:
- Admin listing: eye icon + count per card (`views` already in payload).
- Public listing + detail (`(web)/blog`): show count on cards and detail header.
  Server-side increment already exists; no dedup guard in v1 (refresh re-counts).

## 4. Guides

### Data (append-only migration, superadmin schema)

- `superadmin.guides`: id, title, slug unique, country, context text,
  `background_image_url` nullable, `background_video_url` nullable (form enforces
  one-or-the-other), `pdf_url` (GCS, never public), `pdf_cover_image_url`,
  `is_published`, timestamps, deleted_at.
- `superadmin.guide_leads`: id, guide_id FK, name, email, `email_sent_at`
  nullable, timestamps. Unique (guide_id, email): re-submission resends the email
  instead of duplicating the lead.

### Admin (`/admin/marketing/guides`)

Listing with per-guide lead counts + publish toggle. Create/edit form: title,
country, context, background image OR video upload, PDF upload, PDF cover image —
all via the existing GCS upload path.

### Public (`(web)/guides/[slug]`)

Short, hero-dominant page:
- Hero: background image or muted looping video. Left: title + a few lines of
  context. Right: card with PDF cover image and the name + email form.
- One slim "What's inside" section rendered from context. Nothing else.

### Lead flow

POST → validate (email format + honeypot field; no captcha v1) → insert lead →
LavinMQ email job → mail worker sends templated email with a **7-day signed GCS
link**. Page never exposes the PDF URL; success state = "check your inbox".

## 5. SEO/AEO (`/admin/marketing/seo`)

### Not-connected state (ships first)

Until GSC is configured, the page renders setup instructions: verify the domain
property in Search Console, create a Google service account, add it as a GSC
user, set the key path env var (same pattern as `GCS_KEY_FILE`). No fake data.

### Rankings (GSC connected)

Backend queries the GSC Search Analytics API for queries matching blog keywords
(`focus_keyword`s + `blog_keywords`): position, impressions, clicks, CTR, 28-day
trend. Cached in new table `superadmin.seo_keyword_snapshots` (keyword, date,
position, impressions, clicks, ctr; unique (keyword, date)) — one daily fetch
keeps quota trivial and provides trend history.

### Suggested keywords

Merged from: (a) GSC queries with impressions but position > 10 — real demand,
weak position; (b) Gemini suggestions seeded from existing keywords + counsellor
knowledge base.

### AEO readiness score

Per published blog, computed from content: has FAQ section, has JSON-LD
`FAQPage`, answer-shaped intro, meta description present. Displayed as a
checklist score, explicitly labeled "readiness", not "ranking".

### Action plan

Gemini-generated, grounded in the GSC snapshot + readiness scores. E.g. "keyword
X at position 12 with 4k impressions — add FAQ block, internal link from post Y."

### Env

- `GSC_KEY_FILE` — path to the Google service-account JSON key (mirrors
  `GCS_KEY_FILE`), plus `GSC_SITE_URL` — the verified property
  (e.g. `sc-domain:globalyhub.com`).

## 6. Subscribers (`/admin/marketing/subscribers`)

**Discovery:** the footer "Subscribe to our newsletter" form
(`(web)/components/footer.tsx:56`) is decorative — no handler, no endpoint,
nothing stored. Newsletter capture must be wired as part of this work:

- Extend `REGISTRANT_TYPES` in `waitlist.schema.ts` with `"newsletter"` and
  reuse `waitlist_registrations` (name stored as `""` — the form collects email
  only, and the column is `notNullable`). The existing (email, registrant_type)
  unique conflict-ignore gives dedup for free.
- Wire the footer form to the existing `POST /waitlist` route with
  `type: "newsletter"`, with a success/already-subscribed toast.

Read-only union in one table:
- Newsletter (`waitlist_registrations`, registrant_type = `newsletter`)
- Early interest (`waitlist_registrations`, registrant_type ∈
  `student|institution|service_provider|other` — shown as the audience column)
- Guide leads (`guide_leads` joined to guide title)

Type filter + search + CSV export. No new tables. No edit actions beyond the
footer wiring above.

## Error handling

- Generation worker: per-blog isolation — one failure doesn't kill the batch;
  error stored on the job row and shown in the progress panel.
- Cover generation and email sending fail soft (blog saves coverless; lead saved
  with `email_sent_at` null and retriable).
- GSC fetch failures keep the last snapshot and surface a stale-data banner
  (same stale-over-fail philosophy as the FX rates cache).
- All new endpoints validate input with the existing schema-validation pattern
  and are superadmin-authenticated except the public guide lead POST and public
  guide page.

## Testing

- Unit: SEO prompt-contract assembly (internal-link manifest restriction),
  AEO readiness scorer, guide lead dedup/resend logic, subscribers union query.
- Integration: generation job lifecycle (mock Gemini/Higgsfield), guide lead
  POST → email job enqueue, GSC service with mocked API, blogs filter/sort API.
- E2E happy paths: generate → review → publish; guide page form → lead row;
  subscribers listing shows all three sources.

## Out of scope (v1)

- Live AEO citation tracking (no API exists).
- View-count dedup (refresh re-counts).
- Approval roles/audit trail beyond `is_published`.
- Captcha on guide form (honeypot only).
- Paid SERP APIs / competitor tracking.

## Open items for the user

1. Obtain a **Higgsfield API key** for the backend.
2. Set up **Google Search Console** (property verification + service account) —
   the SEO page works in "not connected" mode until then.
