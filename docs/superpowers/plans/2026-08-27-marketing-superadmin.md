# Superadmin Marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marketing in Super Admin grows from Blog to four tools: AI-generated Blogs, Guides lead-gen landing pages, SEO/AEO dashboard, and a unified Subscribers list.

**Architecture:** Foundation task serializes every shared-file edit (migrations, nav, server registration, npm scripts); four tracks then run in parallel on disjoint files. Backend follows the existing module pattern (`routes/ services/ repositories/ schemas/` + LavinMQ workers); frontend follows the existing admin module pattern (`apis/ components/ store/ page.tsx`).

**Tech Stack:** Fastify + Knex (superadmin schema), Zod, LavinMQ workers, Gemini (`shared/ai/gemini.ts`), Higgsfield HTTP API, GCS (`shared/storage/storageService.ts`), Next.js App Router + Redux Toolkit slices, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-27-marketing-superadmin-design.md`

## Global Constraints

- Migrations are **append-only**: never edit an existing migration file.
- New tables live in the **superadmin** schema; migration files go in `backend/database/migrations/superadmin/` named `20260827_00N_<name>.ts`.
- Tests are tsx assertion scripts in `backend/tests/`, run via `npm run test:<name>` (`node --import tsx tests/<file>.ts`), matching `tests/referrals.ts`. No jest.
- All admin endpoints sit under the authenticated superadmin module; the ONLY new public endpoints are `GET /public/guides/:slug` and `POST /public/guides/:slug/leads`.
- Follow file conventions of the nearest existing sibling (blog module for backend, `admin/marketing/blog/` for frontend). Files ≤ 800 lines, functions ≤ 50.
- Env vars documented in `backend/.env.example` when added: `HIGGSFIELD_API_KEY`, `GSC_KEY_FILE`, `GSC_SITE_URL`.
- Commit after each task with conventional-commit messages. Never push.

---

### Task 0 (FOUNDATION — must complete before Tracks A–D start)

**Files:**
- Create: `backend/database/migrations/superadmin/20260827_001_blog_generation.ts`
- Create: `backend/database/migrations/superadmin/20260827_002_guides.ts`
- Create: `backend/database/migrations/superadmin/20260827_003_seo_snapshots.ts`
- Create: `backend/src/modules/superadmin/marketing/guides/index.ts` (stub)
- Create: `backend/src/modules/superadmin/marketing/seo/index.ts` (stub)
- Create: `backend/src/modules/superadmin/marketing/subscribers/index.ts` (stub)
- Create: `backend/src/modules/guides-public/index.ts` (stub)
- Modify: `frontend/src/app/admin/nav-config.ts:85-90` (Marketing group)
- Modify: `backend/src/server.ts` (register new modules where blogModule registers)
- Modify: `backend/package.json` (scripts: `job:blog-generate`, `job:guide-email`, `job:seo-snapshot`)
- Modify: `backend/.env.example` (three new vars, commented, documented)

**Interfaces:**
- Produces: the three tables below; module stubs each exporting a default async Fastify plugin that registers nothing yet; nav entries; npm script names Tracks A–C fill with real worker files.

- [ ] **Step 1: Write migration 001 — blog generation**

```ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).createTable("blog_generation_jobs", (t) => {
    t.increments("id").primary();
    t.text("status").notNullable().defaultTo("pending"); // pending|running|done|failed
    t.jsonb("keywords").notNullable();
    t.text("context").nullable();
    t.text("topic").nullable();
    t.text("country").nullable();
    t.integer("blog_post_id").nullable().references("id").inTable("superadmin.blog_posts");
    t.text("error").nullable();
    t.timestamps(true, true);
  });
  await knex.schema.withSchema(s).alterTable("blog_posts", (t) => {
    t.boolean("generated_by_ai").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).alterTable("blog_posts", (t) => t.dropColumn("generated_by_ai"));
  await knex.schema.withSchema(s).dropTableIfExists("blog_generation_jobs");
}
```

- [ ] **Step 2: Write migration 002 — guides**

```ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).createTable("guides", (t) => {
    t.increments("id").primary();
    t.text("title").notNullable();
    t.text("slug").notNullable().unique();
    t.text("country").nullable();
    t.text("context").nullable();
    t.text("background_image_url").nullable();
    t.text("background_video_url").nullable();
    t.text("pdf_url").nullable();
    t.text("pdf_cover_image_url").nullable();
    t.boolean("is_published").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
  await knex.schema.withSchema(s).createTable("guide_leads", (t) => {
    t.increments("id").primary();
    t.integer("guide_id").notNullable().references("id").inTable("superadmin.guides");
    t.text("name").notNullable();
    t.text("email").notNullable();
    t.timestamp("email_sent_at").nullable();
    t.timestamps(true, true);
    t.unique(["guide_id", "email"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).dropTableIfExists("guide_leads");
  await knex.schema.withSchema(s).dropTableIfExists("guides");
}
```

- [ ] **Step 3: Write migration 003 — seo snapshots**

```ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").createTable("seo_keyword_snapshots", (t) => {
    t.increments("id").primary();
    t.text("keyword").notNullable();
    t.date("date").notNullable();
    t.decimal("position", 6, 2).nullable();
    t.integer("impressions").notNullable().defaultTo(0);
    t.integer("clicks").notNullable().defaultTo(0);
    t.decimal("ctr", 6, 4).nullable();
    t.timestamps(true, true);
    t.unique(["keyword", "date"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("seo_keyword_snapshots");
}
```

- [ ] **Step 4: Run migrations, verify**

Run from `backend/`: `npm run migrate:superadmin`
Expected: `Batch 2 run: 3 migrations` (batch number may differ). Then `node --import tsx node_modules/.bin/knex migrate:list --knexfile knexfile.ts --env superadmin` shows none pending.

- [ ] **Step 5: Module stubs**

Each stub is the minimal Fastify plugin, e.g. `backend/src/modules/superadmin/marketing/guides/index.ts`:

```ts
import type { FastifyInstance } from "fastify";

export default async function guidesAdminModule(app: FastifyInstance) {
  // Routes registered by Track B.
}
```

Same shape for `seo/index.ts`, `subscribers/index.ts`, and `guides-public/index.ts` (comment naming the owning track). Register all four in `backend/src/server.ts`: the three admin stubs inside the protected block next to `superadminModule` (line ~55); `guidesPublicModule` next to `blogModule`'s public registration (find where `blogModule` from line 27 is registered — mirror it).

- [ ] **Step 6: Nav + scripts + env example**

`nav-config.ts` Marketing group (keep Ads commented):

```ts
{
  label: "Marketing",
  items: [
    { icon: BookMarked, label: "Blogs", href: "/admin/marketing/blog" },
    { icon: BookOpen, label: "Guides", href: "/admin/marketing/guides" },
    { icon: TrendingUp, label: "SEO/AEO", href: "/admin/marketing/seo" },
    { icon: Users, label: "Subscribers", href: "/admin/marketing/subscribers" },
    // { icon: Megaphone, label: "Ads", href: "/admin/marketing/ads" },
  ],
},
```

(Import the three icons from `lucide-react`; if a name collides with an existing import, alias it.)

`backend/package.json` scripts:

```json
"job:blog-generate": "node --import tsx src/modules/superadmin/marketing/blog/workers/blog-generate.worker.ts",
"job:guide-email": "node --import tsx src/modules/superadmin/marketing/guides/workers/guide-email.worker.ts",
"job:seo-snapshot": "node --import tsx src/modules/superadmin/marketing/seo/workers/seo-snapshot.worker.ts"
```

`backend/.env.example`: add commented `HIGGSFIELD_API_KEY`, `GSC_KEY_FILE`, `GSC_SITE_URL` with one-line docs (unset = feature degrades gracefully, never crashes).

- [ ] **Step 7: Verify server boots + frontend compiles, commit**

Run: `cd backend && npx tsc --noEmit` → 0 errors. `cd frontend && npx tsc --noEmit` → no NEW errors outside `.next/`.
Commit: `feat: marketing foundation — migrations, nav, module stubs, worker scripts`

---

### Track A: AI blog generation

**Files:**
- Create: `backend/src/modules/superadmin/marketing/blog/schemas/generation.schema.ts`
- Create: `backend/src/modules/superadmin/marketing/blog/repositories/generation-jobs.repository.ts`
- Create: `backend/src/modules/superadmin/marketing/blog/services/generation.service.ts`
- Create: `backend/src/modules/superadmin/marketing/blog/services/article-prompt.ts`
- Create: `backend/src/modules/superadmin/marketing/blog/lib/higgsfield.ts`
- Create: `backend/src/modules/superadmin/marketing/blog/routes/generation.routes.ts`
- Create: `backend/src/modules/superadmin/marketing/blog/workers/blog-generate.worker.ts`
- Create: `backend/tests/blog-generation.ts` (+ `test:blog-generation` script)
- Modify: `backend/src/modules/superadmin/marketing/blog/index.ts` (register generation routes)
- Create: `frontend/src/app/admin/marketing/blog/components/generate-dialog.tsx`
- Create: `frontend/src/app/admin/marketing/blog/components/generation-progress.tsx`
- Modify: `frontend/src/app/admin/marketing/blog/apis/real-api.ts`, `apis/types.ts`, `store/blog-slice.ts`, `components/blog-view.tsx` (add Generate button + panel)

**Interfaces:**
- Consumes: `blog_generation_jobs` table (Task 0); `shared/ai/gemini.ts`; `ai-counsellor/repositories/knowledge.repository.ts` (embedding search — read its exported functions and reuse; do not duplicate embedding logic); `shared/storage/storageService.ts` for GCS upload; `shared/queue/queueService.ts` for publish.
- Produces: `POST /admin/marketing/blog/generation` body `{ keywords: string[], context?: string, count: 1-5, topic?: string, country?: string }` → `{ jobIds: number[] }`; `GET /admin/marketing/blog/generation?ids=1,2` → `Array<{ id, status, error, blog_post_id }>`. Queue message `{ jobId: number }` on queue name `blog.generate`.

Key contracts (implementer writes tests first per repo pattern, then implements):

- [ ] **Step 1: Test** — `backend/tests/blog-generation.ts` asserts: (a) `buildArticlePrompt()` output contains every keyword, the internal-link manifest URLs, and the instruction string `ONLY link to URLs from the manifest`; (b) `parseArticleResponse()` rejects a response missing meta_title or with meta_title > 60 chars; (c) repository `createJobs()` inserts N rows status `pending` and `claimJob()` flips pending→running atomically (two concurrent claims get different jobs). Run: `npm run test:blog-generation` — expect module-not-found failures first.
- [ ] **Step 2: `article-prompt.ts`** — exports `buildArticlePrompt(input: { keywords: string[]; context?: string; topic?: string; country?: string; knowledgeChunks: string[]; linkManifest: Array<{ title: string; url: string }> }): string` and `parseArticleResponse(raw: string): GeneratedArticle` where `GeneratedArticle = { title, slug, excerpt, content, meta_title, meta_description, focus_keyword, tags: string[], reading_time_minutes: number, faq: Array<{q,a}> }`. Prompt enforces the spec's SEO contract verbatim (H1/H2 hierarchy, meta length caps, FAQ 3–5, JSON-LD Article+FAQPage embedded in content HTML, internal links only from manifest, external links only gov/edu/official-stats with rel="noopener"). Response is JSON — use Gemini JSON mode as `gemini.ts` exemplars do.
- [ ] **Step 3: `higgsfield.ts`** — `generateCoverImage(prompt: string): Promise<Buffer | null>`; returns null (never throws) when `HIGGSFIELD_API_KEY` unset or API fails; logs cause. Base URL in a const; text-to-image endpoint per Higgsfield API docs.
- [ ] **Step 4: repository + service + routes** — follow `posts.repository.ts` / `posts.service.ts` / `posts.routes.ts` structure exactly. `createGeneration()` inserts jobs and publishes `{ jobId }` per job via queueService. Routes validate with Zod (`count: z.number().int().min(1).max(5)`).
- [ ] **Step 5: worker** — mirrors `enquiry-email.worker.ts` head comment style: claim job → knowledge search (top 6 chunks by embedding similarity on joined keywords) → build manifest (published `blog_posts` slugs → `/blog/{slug}` + countries from `countries` table → `/country/{slug}` if that route pattern exists — verify in `(web)/country/`) → Gemini → parse → Higgsfield cover → GCS upload (null cover = save without, note in job error field as `cover: <reason>`, status still `done`) → insert `blog_posts` draft (`generated_by_ai: true`, `is_published: false`) → job `done` + `blog_post_id`. Any throw → status `failed`, error stored, other jobs unaffected.
- [ ] **Step 6: frontend** — Generate button beside the existing New Post button in `blog-view.tsx`; dialog (keyword multi-select from existing keywords API + free-text add, context textarea, count select 1–5, topic/country selects reusing `TOPIC_FILTER_TABS`/`COUNTRY_FILTER_OPTIONS` values); on submit → progress panel polls `GET .../generation?ids=` every 3 s until all terminal; done rows link to the draft editor; failed rows show error. "AI generated — needs review" badge on cards where `generated_by_ai && !is_published`.
- [ ] **Step 7: verify + commit** — `npm run test:blog-generation` passes; both tsc checks clean; commit `feat: AI blog generation pipeline (gemini + higgsfield covers)`.

---

### Track B: Guides

**Files:**
- Create: `backend/src/modules/superadmin/marketing/guides/{schemas/guides.schema.ts, repositories/guides.repository.ts, repositories/leads.repository.ts, services/guides.service.ts, routes/guides.routes.ts, workers/guide-email.worker.ts}`
- Modify: `backend/src/modules/superadmin/marketing/guides/index.ts` (stub → register routes)
- Modify: `backend/src/modules/guides-public/index.ts` (stub → public routes)
- Modify: `backend/src/shared/mail/templates.ts` (append `guideDeliveryEmail()`)
- Create: `backend/tests/guides.ts` (+ `test:guides` script)
- Create: `frontend/src/app/admin/marketing/guides/{page.tsx, layout.tsx, apis/*, store/guides-slice.ts, components/guides-view.tsx, components/guide-form.tsx}`
- Create: `frontend/src/app/(web)/guides/[slug]/page.tsx` + `components/guide-hero.tsx` + `components/lead-form.tsx`

**Interfaces:**
- Consumes: `guides`/`guide_leads` tables (Task 0); `storageService.ts` uploads + `getSignedUrl` (7-day expiry: pass `expirySeconds: 7 * 24 * 3600` — check the actual signature in `storageService.ts` and conform); mail worker pattern; queue `guide.email` message `{ leadId: number }`.
- Produces: admin CRUD under `/admin/marketing/guides` (list includes `lead_count` via LEFT JOIN COUNT); public `GET /public/guides/:slug` (published only, NEVER returns `pdf_url`) and `POST /public/guides/:slug/leads` body `{ name, email, website?: string }` — `website` is the honeypot: non-empty → respond `{ ok: true }` without inserting.

- [ ] **Step 1: Test** — `backend/tests/guides.ts`: (a) public serializer strips `pdf_url`; (b) lead insert dedupes on (guide_id, email) and re-submission returns the existing lead id (so the email re-enqueues — "resend" semantics); (c) honeypot short-circuits; (d) `guideDeliveryEmail()` HTML contains the signed link and guide title escaped via `esc()`. Fail first, then implement.
- [ ] **Step 2: backend module** — repos/services/routes per blog module pattern; uploads use the existing multipart + storageService flow (copy from `countries.routes.ts` which already does image upload). Lead POST → repo insert-or-get → publish `{ leadId }`.
- [ ] **Step 3: worker** — `guide-email.worker.ts`: claim leads where `email_sent_at IS NULL` (batch, mirrors enquiry-email sweep), mint 7-day signed URL for the guide's `pdf_url`, send via mail transport with `guideDeliveryEmail()`, set `email_sent_at`. Failure leaves the row claimable.
- [ ] **Step 4: admin UI** — listing (cards: title, country, published badge, lead count) + create/edit form (title, country auto-slug w/ manual override, context textarea, background image OR video upload — radio toggles which input renders, both never set — PDF upload, cover image upload, publish switch). Follow `blog/` module component structure and slice pattern.
- [ ] **Step 5: public page** — server component fetches `GET /public/guides/:slug`, 404 if unpublished. Hero per spec: bg image or `<video autoPlay muted loop playsInline>`; left title + context excerpt; right card with cover + lead form (client component; success swaps form for "Check your inbox — we've emailed your guide."). One "What's inside" section rendering context. Nothing else. Match `(web)` styling idioms (see `(web)/country/` pages).
- [ ] **Step 6: verify + commit** — `npm run test:guides` passes; tsc clean; commit `feat: guides lead-gen landing pages with email PDF delivery`.

---

### Track C: SEO/AEO

**Files:**
- Create: `backend/src/modules/superadmin/marketing/seo/{lib/gsc-client.ts, services/rankings.service.ts, services/suggestions.service.ts, services/aeo-readiness.service.ts, services/action-plan.service.ts, repositories/snapshots.repository.ts, routes/seo.routes.ts, workers/seo-snapshot.worker.ts, schemas/seo.schema.ts}`
- Modify: `backend/src/modules/superadmin/marketing/seo/index.ts` (stub → routes)
- Create: `backend/tests/seo-aeo.ts` (+ `test:seo-aeo` script)
- Create: `frontend/src/app/admin/marketing/seo/{page.tsx, layout.tsx, apis/*, store/seo-slice.ts, components/seo-view.tsx, components/setup-instructions.tsx, components/rankings-table.tsx, components/suggestions-panel.tsx, components/action-plan.tsx}`

**Interfaces:**
- Consumes: `seo_keyword_snapshots` (Task 0); `blog_keywords` + `blog_posts.focus_keyword` for the tracked-keyword set; `gemini.ts`; googleapis GSC Search Analytics (add `googleapis` dep ONLY if not already in package.json — check first; if adding, prefer the scoped `@googleapis/searchconsole` to avoid the monolith).
- Produces: `GET /admin/marketing/seo/status` → `{ connected: boolean }` (true iff `GSC_KEY_FILE` + `GSC_SITE_URL` set and a probe query succeeds — cache the probe result in-process for 10 min); `GET /admin/marketing/seo/rankings` → snapshots grouped by keyword with 28-day trend; `GET /admin/marketing/seo/suggestions`; `GET /admin/marketing/seo/readiness`; `POST /admin/marketing/seo/action-plan` → Gemini plan.

- [ ] **Step 1: Test** — `backend/tests/seo-aeo.ts`: (a) `computeAeoReadiness(content: string, meta_description: string | null)` returns per-check booleans `{ hasFaqSection, hasFaqJsonLd, hasAnswerShapedIntro, hasMetaDescription, score: 0-100 }` — feed it a fixture with all four and one with none; answer-shaped intro = first `<p>` ≤ 60 words containing a keyword-bearing declarative sentence (implement as: first paragraph ≤ 60 words — keep the heuristic simple and documented); (b) suggestion merge dedupes GSC vs Gemini keywords case-insensitively; (c) rankings service returns `stale: true` when the newest snapshot is > 48h old.
- [ ] **Step 2: `gsc-client.ts`** — lazy-init googleapis JWT auth from `GSC_KEY_FILE`; `querySearchAnalytics({ startDate, endDate, dimensions: ["query"] })` filtered client-side to the tracked-keyword set; every method returns a typed result or throws `GscNotConfiguredError` when env unset — routes map that to `{ connected: false }`, never 500.
- [ ] **Step 3: snapshot worker** — daily one-shot: fetch last 28 days for tracked keywords, upsert into snapshots (`onConflict(["keyword","date"]).merge()`).
- [ ] **Step 4: services + routes** — suggestions: GSC rows with `impressions > 100 && position > 10` (label `source: "gsc"`) merged with Gemini suggestions seeded from tracked keywords + top knowledge-base topics (`source: "ai"`); action-plan: Gemini prompt receives rankings JSON + readiness JSON, returns `Array<{ priority: 1|2|3, action: string, keyword?: string, blog_slug?: string }>`.
- [ ] **Step 5: frontend** — `/status` gates everything: not connected → `setup-instructions.tsx` (the spec's GSC setup steps, verbatim, with the env var names); connected → rankings table (keyword, position, Δ28d arrow, impressions, clicks, CTR, stale banner), suggestions panel (two source badges), readiness checklist per published blog, action plan list with a Regenerate button.
- [ ] **Step 6: verify + commit** — `npm run test:seo-aeo` passes; tsc clean; commit `feat: seo/aeo dashboard — gsc rankings, suggestions, readiness, action plan`.

---

### Track D: Subscribers + newsletter wiring + blogs filter bar & views

**Files:**
- Modify: `backend/src/modules/waitlist/schemas/waitlist.schema.ts` (add `"newsletter"` to `REGISTRANT_TYPES`; make `name` optional defaulting to `""` — check `waitlistConfirmationEmail` in templates.ts handles empty name gracefully; if it renders "Hi ," fix the template to omit the greeting name when empty)
- Create: `backend/src/modules/superadmin/marketing/subscribers/{routes/subscribers.routes.ts, services/subscribers.service.ts, repositories/subscribers.repository.ts, schemas/subscribers.schema.ts}`
- Modify: `backend/src/modules/superadmin/marketing/subscribers/index.ts` (stub → routes)
- Create: `backend/tests/subscribers.ts` (+ `test:subscribers` script)
- Create: `frontend/src/app/admin/marketing/subscribers/{page.tsx, layout.tsx, apis/*, components/subscribers-view.tsx}`
- Modify: `frontend/src/app/(web)/components/footer.tsx:54-64` (wire the form)
- Modify: `frontend/src/app/admin/marketing/blog/components/blog-view.tsx` + `const/index.ts` (filter bar order + sort + views)
- Modify: `frontend/src/app/(web)/blog/page.tsx` and `(web)/blog/[id]/page.tsx` (view counts display)

**Interfaces:**
- Consumes: `waitlist_registrations`, `guide_leads` + `guides.title` (Track B's tables exist from Task 0 — only the table, no code dependency on Track B).
- Produces: `GET /admin/marketing/subscribers?type=newsletter|early_interest|guide_lead&search=&page=&limit=` → `Paginated<{ source: "newsletter"|"early_interest"|"guide_lead", name, email, detail: string | null, created_at }>` (`detail` = audience type for early interest, guide title for guide leads, null for newsletter); `GET /admin/marketing/subscribers/export.csv` same filters, streams CSV.

- [ ] **Step 1: Test** — `backend/tests/subscribers.ts`: (a) union query returns rows from all three sources with correct `source` labels and sorts by `created_at` desc; (b) type filter narrows to one source; (c) CSV escaping (emails/names containing commas and quotes); (d) waitlist schema accepts `{ email, type: "newsletter" }` without name and stores `""`.
- [ ] **Step 2: backend** — repository builds the union with three selects UNION ALL (raw knex; each select casts to the common shape) + count query; CSV route sets `content-type: text/csv` and `content-disposition: attachment`.
- [ ] **Step 3: footer wiring** — client-side handler: email input + Subscribe button POST to the existing waitlist route with `type: "newsletter"`; success → sonner toast "Subscribed!"; duplicate → same toast (endpoint is conflict-ignore, returns ok — that's fine); invalid email → inline error. Footer is a server component today — extract the form into a small `"use client"` `newsletter-form.tsx` next to it.
- [ ] **Step 4: subscribers UI** — table (source badge, name, email, detail, date), type filter select, search input (server-side via query params), CSV export button hitting the export URL.
- [ ] **Step 5: blogs filter bar + views** — reorder `blog-view.tsx` controls to: search → publish select (replace `AdminSegmentedTabs` BLOG_TABS with a `Select`: All/Drafts/Published) → topic `Select` (replace segmented tabs) → country combobox (existing) → sort toggle button "Most popular"/"Newest" (client-side `[...posts].sort((a,b) => b.views - a.views)` when active). Eye icon + `views` count on each admin card. Public: views count on `(web)/blog` cards and detail header (field already in the public payload — verify in `public-blog.routes.ts`, add to serializer if absent).
- [ ] **Step 6: verify + commit** — `npm run test:subscribers` passes; tsc clean; commit `feat: subscribers list, newsletter capture, blogs filter bar + view counts`.

---

## Integration task (after all tracks merge)

- [ ] Boot backend (`npm run dev`) — all modules register, no route conflicts.
- [ ] `npm run migrate:superadmin` idempotent (nothing pending).
- [ ] Manual smoke: generate 1 blog (mock keys if real keys absent — worker degrades per contract), create + publish a guide, submit its lead form, newsletter footer submit, subscribers page shows all three, SEO page shows not-connected state.
- [ ] Run every `test:*` added by tracks.
