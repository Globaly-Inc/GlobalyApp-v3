// Cross-app GlobalyAI feed (G7, §3.4) — outbound export + inbound ingest.
//
// SPEC SOURCE: V1's export-courses and receive-institution-data edge functions.
// Three things here deliberately differ from V1, each asserted:
//   1. An UNCONFIGURED secret answers 503, not 401. V1 returned 401 for its own
//      missing configuration, blaming the caller for the operator's gap.
//   2. Inbound data lands in EXTRACTION STAGING with job status "review", not in the
//      live `businesses` / `business_services` tables. §3.4 specifies "inbound
//      webhook → staging"; V1 wrote the live catalogue directly.
//   3. Re-posting the same payload CONVERGES. V1 re-created a business on every
//      retry whenever the payload had no website.
//
// The secrets are mutated onto the config object per test. That is the honest way to
// exercise all three states (unset / wrong / right) in an environment where neither
// secret exists — nothing reads a real credential and none is invented.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const EXPORT_SECRET = "test-globaly-ai-sync-secret";
const INGEST_SECRET = "test-webhook-ingest-secret";
const S = "superadmin";

/** A minimal but complete inbound payload. */
function payload(website: string, overrides: Record<string, unknown> = {}) {
  return {
    institution: {
      name: "Sunrise Institute of Technology",
      website,
      email: "admissions@sunrise.test",
      city: "Melbourne",
      country: "Australia",
      description: "A vocational provider.",
      logo_url: "https://cdn.sunrise.test/logo.png",
    },
    campuses: [{ name: "City Campus", city: "Melbourne", country: "Australia" }],
    courses: [
      {
        name: "Diploma of Information Technology",
        degree_level: "Diploma",
        subject_area: "Information Technology",
        duration_value: 12,
        duration_unit: "months",
        fees: [
          {
            name: "Tuition",
            applicable_to: "international",
            currency: "AUD",
            installments: [{ items: [{ amount: "8000.50" }] }, { items: [{ amount: "8000.50" }] }],
          },
        ],
        intakes: [{ intake_name: "February 2027", intake_month: 2, intake_year: 2027 }],
        eligibility: [{ name: "Year 12", min_score_percent: 60, language_tests: [], academic_tests: [] }],
        accreditations: [{ name: "ASQA Registered", issuing_organization: "ASQA" }],
      },
    ],
    ...overrides,
  };
}

describeDb("cross-app GlobalyAI feed", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let cfg: Record<string, unknown>;

  const createdUserIds: number[] = [];
  const createdJobIds: string[] = [];
  let bizId = 0;
  let serviceId = "";
  let unpublishedServiceId = "";

  const website = `https://sunrise-${process.pid}.test`;

  beforeAll(async () => {
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config: cfg } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const crossAppModule = (await import("../../src/modules/cross-app/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(crossAppModule);
    await app.ready();

    // ── live-catalogue fixtures for the export ──
    const runId = `${process.pid}${Date.now() % 1_000_000}`;
    const [user] = await masterKnex("platform_users")
      .insert({
        first_name: "Feed",
        last_name: "Owner",
        email: uniqueEmail("feed.owner"),
        account_status: 1,
      })
      .returning(["id"]);
    createdUserIds.push(Number(user.id));

    const [biz] = await masterKnex("businesses")
      .insert({
        owner_id: Number(user.id),
        subdomain: `feed-${runId}`,
        business_name: `Feed College ${runId}`,
        account_status: 1,
        status: "verified",
        website: "https://feed-college.test",
        city: "Sydney",
      })
      .returning(["id", "schema_name"]);
    bizId = Number(biz.id);

    const now = new Date();
    const insertService = async (name: string, isPublished: boolean) => {
      const [row] = await masterKnex("catalog_services")
        .insert({
          service_id: masterKnex.raw("gen_random_uuid()"),
          schema_name: biz.schema_name,
          owner_org_type: "business",
          owner_org_id: bizId,
          name,
          is_published: isPublished,
          is_featured: false,
          created_at: now,
          updated_at: now,
          min_fee: "12000.00",
          fee_currency: "AUD",
        })
        .returning(["service_id"]);
      return String(row.service_id);
    };
    serviceId = await insertService(`Bachelor of Feeds ${runId}`, true);
    unpublishedServiceId = await insertService(`Draft of Feeds ${runId}`, false);
  });

  afterEach(() => {
    // Back to the real state of this environment: both secrets absent.
    delete cfg.GLOBALY_AI_SYNC_SECRET;
    delete cfg.WEBHOOK_INGEST_SECRET;
  });

  afterAll(async () => {
    delete cfg.GLOBALY_AI_SYNC_SECRET;
    delete cfg.WEBHOOK_INGEST_SECRET;
    await app?.close();

    if (masterKnex) {
      // Children cascade from the job.
      if (createdJobIds.length) {
        await masterKnex(`${S}.extraction_jobs`).whereIn("id", createdJobIds).del();
      }
      await masterKnex(`${S}.extraction_accreditations`).where({ name: "ASQA Registered" }).del();
      await masterKnex("catalog_services")
        .whereIn("service_id", [serviceId, unpublishedServiceId])
        .del();
      await masterKnex("businesses").where({ id: bizId }).del();
      await masterKnex("platform_users").whereIn("id", createdUserIds).del();
    }
    await shutdownPools?.();
  });

  const exportGet = (headers: Record<string, string> = {}, query = "") =>
    app.inject({ method: "GET", url: `/api/v3/cross-app/export/courses${query}`, headers });

  const ingestPost = (body: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: "POST", url: "/api/v3/cross-app/institutions", headers, payload: body });

  // ── FAIL CLOSED: no credential exists here, and none is invented ───────────

  describe("fail closed when unconfigured", () => {
    it("export 503s when GLOBALY_AI_SYNC_SECRET is unset", async () => {
      const res = await exportGet({ authorization: "Bearer anything" });
      expect(res.statusCode).toBe(503);
      expect(res.json().courses).toBeUndefined();
    });

    it("export 503s even with NO auth header — never open because unconfigured", async () => {
      expect((await exportGet()).statusCode).toBe(503);
    });

    it("ingest 503s when WEBHOOK_INGEST_SECRET is unset, and writes nothing", async () => {
      const before = await masterKnex(`${S}.extraction_jobs`).count<{ count: string }[]>({ count: "*" });
      const res = await ingestPost(payload(website), { "x-webhook-secret": "anything" });
      expect(res.statusCode).toBe(503);
      const after = await masterKnex(`${S}.extraction_jobs`).count<{ count: string }[]>({ count: "*" });
      expect(after[0].count).toBe(before[0].count);
    });
  });

  // ── 401 vs 503: the caller's fault vs the operator's ──────────────────────

  describe("authentication", () => {
    it("export 401s a wrong bearer token once the secret IS configured", async () => {
      cfg.GLOBALY_AI_SYNC_SECRET = EXPORT_SECRET;
      expect((await exportGet({ authorization: "Bearer wrong" })).statusCode).toBe(401);
      expect((await exportGet()).statusCode).toBe(401);
      expect((await exportGet({ authorization: EXPORT_SECRET })).statusCode).toBe(401);
    });

    it("ingest 401s a wrong webhook secret once it IS configured", async () => {
      cfg.WEBHOOK_INGEST_SECRET = INGEST_SECRET;
      expect((await ingestPost(payload(website), { "x-webhook-secret": "wrong" })).statusCode).toBe(401);
      expect((await ingestPost(payload(website))).statusCode).toBe(401);
    });

    it("the two secrets are separate — an export token cannot push", async () => {
      // Read access must not imply write access.
      cfg.GLOBALY_AI_SYNC_SECRET = EXPORT_SECRET;
      cfg.WEBHOOK_INGEST_SECRET = INGEST_SECRET;
      const res = await ingestPost(payload(website), { "x-webhook-secret": EXPORT_SECRET });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── OUTBOUND EXPORT ───────────────────────────────────────────────────────

  describe("GET /export/courses", () => {
    const authed = () => ({ authorization: `Bearer ${EXPORT_SECRET}` });

    it("returns the live catalogue with its owning orgs", async () => {
      cfg.GLOBALY_AI_SYNC_SECRET = EXPORT_SECRET;
      const res = await exportGet(authed());
      expect(res.statusCode).toBe(200);

      const body = res.json();
      const ids = body.courses.map((c: { service_id: string }) => c.service_id);
      expect(ids).toContain(serviceId);
      expect(body.institutions.some((o: { id: number }) => o.id === bizId)).toBe(true);
      expect(body.exported_at).toBeDefined();
    });

    it("NEVER exports an unpublished service — same predicate as the public catalogue", async () => {
      cfg.GLOBALY_AI_SYNC_SECRET = EXPORT_SECRET;
      const body = (await exportGet(authed())).json();
      const ids = body.courses.map((c: { service_id: string }) => c.service_id);
      expect(ids).not.toContain(unpublishedServiceId);
    });

    it("discriminates the polymorphic owner by org_type", async () => {
      cfg.GLOBALY_AI_SYNC_SECRET = EXPORT_SECRET;
      const body = (await exportGet(authed())).json();
      const org = body.institutions.find((o: { id: number }) => o.id === bizId);
      // V3 has two org tables with independent serial ids; a bare integer is ambiguous.
      expect(org.org_type).toBe("business");
    });

    it("honours ?since for incremental sync", async () => {
      cfg.GLOBALY_AI_SYNC_SECRET = EXPORT_SECRET;
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const body = (await exportGet(authed(), `?since=${encodeURIComponent(future)}`)).json();
      expect(body.courses).toHaveLength(0);
      expect(body.since).toBe(future);
    });

    it("paginates courses and reports next_page honestly", async () => {
      cfg.GLOBALY_AI_SYNC_SECRET = EXPORT_SECRET;
      const body = (await exportGet(authed(), "?page=1&limit=10")).json();
      expect(body.page).toBe(1);
      expect(body.limit).toBe(10);
      // V1 capped courses at 2000 with next_page null — a silent truncation.
      const expectMore = body.courses.length < body.total_courses;
      expect(body.next_page === null).toBe(!expectMore);
    });

    it("400s a limit outside the allowed range rather than clamping silently", async () => {
      cfg.GLOBALY_AI_SYNC_SECRET = EXPORT_SECRET;
      expect((await exportGet(authed(), "?limit=5000")).statusCode).toBe(400);
      expect((await exportGet(authed(), "?since=not-a-date")).statusCode).toBe(400);
    });
  });

  // ── INBOUND INGEST → STAGING ───────────────────────────────────────────────

  describe("POST /institutions", () => {
    const authed = () => ({ "x-webhook-secret": INGEST_SECRET });

    it("lands the payload in extraction staging with status 'review'", async () => {
      cfg.WEBHOOK_INGEST_SECRET = INGEST_SECRET;
      const res = await ingestPost(payload(website), authed());
      expect(res.statusCode).toBe(200);

      const body = res.json();
      createdJobIds.push(body.job_id);
      expect(body).toMatchObject({
        success: true,
        job_created: true,
        courses: 1,
        campuses: 1,
        fees: 1,
        intakes: 1,
        eligibility: 1,
        accreditations: 1,
      });

      const job = await masterKnex(`${S}.extraction_jobs`)
        .select("status", "source_type", "institution_url", "institution_name")
        .where({ id: body.job_id })
        .first();
      expect(job.status).toBe("review");
      expect(job.source_type).toBe("cross_app_webhook");
      expect(job.institution_url).toBe(website);
    });

    it("writes NOTHING to the live catalogue", async () => {
      // The V1 behaviour this replaces: it inserted straight into `businesses`.
      const live = await masterKnex("businesses").where({ website }).first();
      expect(live).toBeUndefined();
      const services = await masterKnex("catalog_services").where({ name: "Diploma of Information Technology" });
      expect(services).toHaveLength(0);
    });

    it("stores the fee total exactly, via the junction the pipeline uses", async () => {
      const jobId = createdJobIds[0];
      const fee = await masterKnex(`${S}.extraction_course_fees`)
        .select("total_amount", "currency", "student_type")
        .where({ job_id: jobId })
        .first();
      // 8000.50 + 8000.50 — a float sum would be 16001.000000000002.
      expect(String(fee.total_amount)).toBe("16001.00");
      expect(fee.currency).toBe("AUD");
      expect(fee.student_type).toBe("international");

      const link = await masterKnex(`${S}.extraction_course_fee_assignments`)
        .where({ job_id: jobId })
        .first();
      expect(link).toBeDefined();
    });

    it("marks staged courses unverified — arriving is not verification", async () => {
      const course = await masterKnex(`${S}.extraction_courses`)
        .select("verification_status", "duration_weeks")
        .where({ job_id: createdJobIds[0] })
        .first();
      expect(course.verification_status).toBe("unverified");
      expect(course.duration_weeks).toBe(48);
    });

    it("is IDEMPOTENT — a second identical post converges, it does not accumulate", async () => {
      cfg.WEBHOOK_INGEST_SECRET = INGEST_SECRET;
      const res = await ingestPost(payload(website), authed());
      expect(res.statusCode).toBe(200);
      expect(res.json().job_created).toBe(false);
      expect(res.json().job_id).toBe(createdJobIds[0]);

      // One job, one course, one fee — not two of each.
      const jobs = await masterKnex(`${S}.extraction_jobs`).where({
        source_type: "cross_app_webhook",
        institution_url: website,
      });
      expect(jobs).toHaveLength(1);
      const courses = await masterKnex(`${S}.extraction_courses`).where({ job_id: createdJobIds[0] });
      expect(courses).toHaveLength(1);
      const fees = await masterKnex(`${S}.extraction_course_fees`).where({ job_id: createdJobIds[0] });
      expect(fees).toHaveLength(1);
    });

    it("requires institution.website — V1's website-less path was non-idempotent", async () => {
      cfg.WEBHOOK_INGEST_SECRET = INGEST_SECRET;
      const body = payload(website) as Record<string, unknown>;
      const institution = { ...(body.institution as Record<string, unknown>) };
      delete institution.website;
      const res = await ingestPost({ ...body, institution }, authed());
      expect(res.statusCode).toBe(400);
    });

    it("rejects a javascript: URL anywhere in the payload — webUrl(), not z.string().url()", async () => {
      cfg.WEBHOOK_INGEST_SECRET = INGEST_SECRET;
      const bad = payload("javascript:alert(1)");
      expect((await ingestPost(bad, authed())).statusCode).toBe(400);

      const badLogo = payload(website) as Record<string, unknown>;
      badLogo.institution = {
        ...(badLogo.institution as Record<string, unknown>),
        logo_url: "data:text/html,<script>",
      };
      expect((await ingestPost(badLogo, authed())).statusCode).toBe(400);
    });

    it("400s a payload with no institution name", async () => {
      cfg.WEBHOOK_INGEST_SECRET = INGEST_SECRET;
      const res = await ingestPost({ institution: { website } }, authed());
      expect(res.statusCode).toBe(400);
    });
  });
});
