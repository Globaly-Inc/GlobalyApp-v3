// Jobs board (Wave G2): business posting, the applicant pipeline, admin oversight,
// and the fail-closed AI seam.
//
// The contract under test is V2's jobs.ts / admin-jobs.ts plus V1's job-ai-assist
// and job-match-score edge functions — never this repo's implementation.
//
// Everything runs offline. There is no GEMINI_API_KEY in this environment and the
// suite deletes it from config anyway, so the AI routes are asserted on the honest
// 503 rather than on a fabricated score (V1 returned {score: 50} on a missing key;
// that is a defect, and §1.6's fail-closed rule is the spec).
//
// Fixtures are minted per run with a unique suffix, because the test database
// persists between runs.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("jobs board", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let sign: (claims: Record<string, unknown>) => string;

  let suffix = "";
  let adminToken = "";

  interface Biz {
    id: number;
    schema: string;
    ownerId: number;
    token: string;
  }

  let alpha: Biz; // the posting business
  let beta: Biz; // the neighbour that must never see alpha's rows
  let student: { id: number; token: string };
  let student2: { id: number; token: string };

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });
    // Fail-closed means fail-closed: no key, for every test in this file.
    delete config.GEMINI_API_KEY;

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const jobsModule = (await import("../../src/modules/jobs/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(jobsModule);
    });
    await app.ready();

    suffix = `${process.pid}${Date.now() % 1_000_000}`;
    sign = (claims) => jwt.sign({ email: "jobs@vitest.local", ...claims }, config.JWT_SECRET as string);
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });

    const makeBusiness = async (label: string): Promise<Biz> => {
      const [owner] = await masterKnex("platform_users")
        .insert({
          first_name: "Owner",
          last_name: label,
          email: uniqueEmail(`jobs.owner.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: owner.id,
          subdomain: `jobs-${label}-${suffix}`,
          business_name: `Jobs ${label} ${suffix}`,
          email: uniqueEmail(`jobs.biz.${label}`),
          account_status: 1,
          status: "verified",
        })
        .returning(["id", "schema_name"]);
      return {
        id: Number(row.id),
        schema: row.schema_name,
        ownerId: Number(owner.id),
        token: sign({ sub: String(owner.id), type: "platform_user", orgId: row.schema_name }),
      };
    };

    // `withProfile` decides whether platform_user_profiles has a row — V1's
    // match-score 404s without one, and that is asserted below.
    const makeStudent = async (label: string, withProfile = true) => {
      const [user] = await masterKnex("platform_users")
        .insert({
          first_name: "Stu",
          last_name: `${label}${suffix}`,
          email: uniqueEmail(`jobs.student.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      if (withProfile) {
        await masterKnex("platform_user_profiles").insert({
          user_id: user.id,
          city_of_residence: "Sydney",
          highest_degree_level: "Bachelor",
        });
      }
      return { id: Number(user.id), token: sign({ sub: String(user.id), type: "platform_user" }) };
    };

    alpha = await makeBusiness("alpha");
    beta = await makeBusiness("beta");
    student = await makeStudent("one");
    student2 = await makeStudent("two", false);
  });

  afterAll(async () => {
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: (payload ?? {}) as object });
  const patch = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "PATCH", url, headers: auth(token), payload: (payload ?? {}) as object });
  const del = (url: string, token: string) =>
    app.inject({ method: "DELETE", url, headers: auth(token) });

  const draftBody = (title: string) => ({
    title,
    description: "Front of house, evenings and weekends. Training provided.",
    job_type: "part_time",
    category: "hospitality",
    location_city: "Sydney",
    pay_min: 28,
    pay_max: 34,
    pay_currency: "AUD",
    pay_unit: "hour",
    skill_tags: ["customer service", "barista"],
    visa_types_allowed: ["subclass_500"],
    work_rights_required: true,
  });

  /** A published job belonging to `biz`, ready to receive applications. */
  async function publishedJob(biz: Biz, title: string): Promise<number> {
    const created = await post("/api/v3/business/jobs", biz.token, draftBody(title));
    const id = created.json().job.id as number;
    await post(`/api/v3/business/jobs/${id}/publish`, biz.token);
    return id;
  }

  // ── posting ────────────────────────────────────────────────────────────────

  describe("posting", () => {
    it("creates a job as a draft owned by the caller's business", async () => {
      const res = await post("/api/v3/business/jobs", alpha.token, draftBody(`Barista ${suffix}`));
      expect(res.statusCode).toBe(201);
      const { job } = res.json();
      expect(job.status).toBe("draft");
      expect(job.published_at).toBeNull();
      expect(job.business_id).toBe(alpha.id);
      expect(job.created_by).toBe(alpha.ownerId);
      // V2 requires a unique slug; the caller never supplies one.
      expect(job.slug).toMatch(/^barista/);
      expect(job.skill_tags).toEqual(["customer service", "barista"]);
      expect(job.applications_count).toBe(0);
    });

    it("round-trips every writable V2 field, screening questions included", async () => {
      const res = await post("/api/v3/business/jobs", alpha.token, {
        ...draftBody(`Full spec ${suffix}`),
        summary: "Barista, inner west",
        is_remote: false,
        is_hybrid: true,
        company_name: "Alpha Coffee",
        apply_method: "external",
        apply_url: "https://alpha.example/apply",
        is_student_friendly: true,
        closing_at: "2026-12-01T00:00:00.000Z",
        screening_questions: [{ id: "q1", label: "Do you hold work rights?", type: "boolean" }],
      });
      expect(res.statusCode).toBe(201);
      const { job } = res.json();
      expect(job.is_hybrid).toBe(true);
      expect(job.apply_method).toBe("external");
      expect(job.company_name).toBe("Alpha Coffee");
      expect(job.screening_questions).toEqual([
        { id: "q1", label: "Do you hold work rights?", type: "boolean" },
      ]);
      expect(job.closing_at).not.toBeNull();
    });

    it("rejects a posting without the fields V2 marks NOT NULL", async () => {
      const res = await post("/api/v3/business/jobs", alpha.token, { title: "Only a title" });
      expect(res.statusCode).toBe(400);
    });

    it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"])(
      "refuses %s as an apply_url — the frontend renders it into an href",
      async (hostile) => {
        const res = await post("/api/v3/business/jobs", alpha.token, {
          ...draftBody(`XSS ${suffix}`),
          apply_method: "external",
          apply_url: hostile,
        });
        expect(res.statusCode).toBe(400);
      },
    );

    it("refuses a caller with no business context", async () => {
      const res = await post("/api/v3/business/jobs", student.token, draftBody("Nope"));
      expect(res.statusCode).toBe(403);
    });

    it("publishes, then closes, stamping published_at once", async () => {
      const created = await post("/api/v3/business/jobs", alpha.token, draftBody(`Kitchen ${suffix}`));
      const id = created.json().job.id;

      const published = await post(`/api/v3/business/jobs/${id}/publish`, alpha.token);
      expect(published.statusCode).toBe(200);
      expect(published.json().job.status).toBe("open");
      const publishedAt = published.json().job.published_at;
      expect(publishedAt).not.toBeNull();

      const closed = await post(`/api/v3/business/jobs/${id}/close`, alpha.token);
      expect(closed.statusCode).toBe(200);
      expect(closed.json().job.status).toBe("closed");
      // Closing must not erase or move the original publication timestamp.
      expect(closed.json().job.published_at).toBe(publishedAt);
    });

    it("patches only the supplied fields", async () => {
      const created = await post("/api/v3/business/jobs", alpha.token, draftBody(`Cleaner ${suffix}`));
      const id = created.json().job.id;
      const res = await patch(`/api/v3/business/jobs/${id}`, alpha.token, { summary: "Weekend shifts" });
      expect(res.statusCode).toBe(200);
      expect(res.json().job.summary).toBe("Weekend shifts");
      expect(res.json().job.title).toBe(`Cleaner ${suffix}`);
    });

    it("soft-deletes, and the job stops being listed", async () => {
      const created = await post("/api/v3/business/jobs", alpha.token, draftBody(`Temp ${suffix}`));
      const id = created.json().job.id;
      expect((await del(`/api/v3/business/jobs/${id}`, alpha.token)).statusCode).toBe(204);
      expect((await get(`/api/v3/business/jobs/${id}`, alpha.token)).statusCode).toBe(404);
    });

    it("lists only the caller's own jobs, filtered by status", async () => {
      await publishedJob(beta, `Beta only ${suffix}`);
      const res = await get("/api/v3/business/jobs?status=open", alpha.token);
      expect(res.statusCode).toBe(200);
      const titles = res.json().data.map((j: { title: string }) => j.title);
      expect(titles).not.toContain(`Beta only ${suffix}`);
      expect(res.json().data.every((j: { status: string }) => j.status === "open")).toBe(true);
    });
  });

  // ── cross-tenant isolation (security requirement, §1.6) ────────────────────

  describe("cross-tenant isolation", () => {
    it("hides another business's job behind a 404, not a 403", async () => {
      const id = await publishedJob(alpha, `Secret alpha ${suffix}`);
      const res = await get(`/api/v3/business/jobs/${id}`, beta.token);
      expect(res.statusCode).toBe(404);
    });

    it("refuses to patch another business's job", async () => {
      const id = await publishedJob(alpha, `Untouchable ${suffix}`);
      const res = await patch(`/api/v3/business/jobs/${id}`, beta.token, { title: "hijacked" });
      expect(res.statusCode).toBe(404);
      const owner = await get(`/api/v3/business/jobs/${id}`, alpha.token);
      expect(owner.json().job.title).toBe(`Untouchable ${suffix}`);
    });

    it("refuses to publish or close another business's job", async () => {
      const id = await publishedJob(alpha, `Locked ${suffix}`);
      expect((await post(`/api/v3/business/jobs/${id}/close`, beta.token)).statusCode).toBe(404);
      expect((await get(`/api/v3/business/jobs/${id}`, alpha.token)).json().job.status).toBe("open");
    });

    it("never shows another business's applicants", async () => {
      const id = await publishedJob(alpha, `Applicants alpha ${suffix}`);
      await post(`/api/v3/jobs/${id}/applications`, student.token, { cover_letter: "Please" });

      const intruder = await get(`/api/v3/business/jobs/${id}/applications`, beta.token);
      expect(intruder.statusCode).toBe(404);

      const owner = await get(`/api/v3/business/jobs/${id}/applications`, alpha.token);
      expect(owner.statusCode).toBe(200);
      expect(owner.json().data).toHaveLength(1);
    });

    it("refuses to move another business's applicant through the pipeline", async () => {
      const id = await publishedJob(alpha, `Pipeline alpha ${suffix}`);
      const applied = await post(`/api/v3/jobs/${id}/applications`, student.token, {});
      const applicationId = applied.json().application.id;

      const res = await patch(
        `/api/v3/business/jobs/${id}/applications/${applicationId}`,
        beta.token,
        { stage: "rejected" },
      );
      expect(res.statusCode).toBe(404);
    });
  });

  // ── applicants ─────────────────────────────────────────────────────────────

  describe("applicants", () => {
    it("lets a student apply once, and counts it on the job", async () => {
      const id = await publishedJob(alpha, `Apply once ${suffix}`);

      const first = await post(`/api/v3/jobs/${id}/applications`, student.token, {
        cover_letter: "I have two years of café experience.",
        screening_answers: [{ question: "Availability?", answer: "Evenings" }],
      });
      expect(first.statusCode).toBe(201);
      expect(first.json().application.stage).toBe("new");
      expect(first.json().application.user_id).toBe(student.id);
      expect(first.json().application.business_id).toBe(alpha.id);

      // V2: unique (job_id, user_id).
      const second = await post(`/api/v3/jobs/${id}/applications`, student.token, {});
      expect(second.statusCode).toBe(409);

      const job = await get(`/api/v3/business/jobs/${id}`, alpha.token);
      expect(job.json().job.applications_count).toBe(1);
    });

    it("refuses an application to a job that is not open", async () => {
      const created = await post("/api/v3/business/jobs", alpha.token, draftBody(`Draft only ${suffix}`));
      const id = created.json().job.id;
      const res = await post(`/api/v3/jobs/${id}/applications`, student.token, {});
      expect(res.statusCode).toBe(404);
    });

    it("rejects a resume whose mime type is not on the V2 whitelist", async () => {
      const id = await publishedJob(alpha, `Resume check ${suffix}`);
      const res = await post(`/api/v3/jobs/${id}/applications`, student2.token, {
        resume: { url: "https://cdn.example/cv.exe", mime_type: "application/x-msdownload", size_bytes: 1024 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuses a javascript: resume URL", async () => {
      const id = await publishedJob(alpha, `Resume xss ${suffix}`);
      const res = await post(`/api/v3/jobs/${id}/applications`, student2.token, {
        resume: { url: "javascript:alert(1)", mime_type: "application/pdf", size_bytes: 2048 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("stores a whitelisted resume with its uploader stamped", async () => {
      const id = await publishedJob(alpha, `Resume ok ${suffix}`);
      const res = await post(`/api/v3/jobs/${id}/applications`, student2.token, {
        resume: { url: "https://cdn.example/cv.pdf", mime_type: "application/pdf", size_bytes: 2048 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().application.resume_uploaded_by).toBe(student2.id);
      expect(res.json().application.resume_uploaded_at).not.toBeNull();
    });

    it("moves an applicant through the pipeline and records who moved them", async () => {
      const id = await publishedJob(alpha, `Stages ${suffix}`);
      const applied = await post(`/api/v3/jobs/${id}/applications`, student.token, {});
      const applicationId = applied.json().application.id;

      const res = await patch(
        `/api/v3/business/jobs/${id}/applications/${applicationId}`,
        alpha.token,
        { stage: "shortlisted", notes: "Strong availability" },
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().application.stage).toBe("shortlisted");
      expect(res.json().application.notes).toBe("Strong availability");
      expect(res.json().application.stage_changed_by).toBe(alpha.ownerId);
      expect(res.json().application.stage_changed_at).not.toBeNull();
    });

    it("annotates without moving the stage, and rejects an empty patch", async () => {
      const id = await publishedJob(alpha, `Notes only ${suffix}`);
      const applied = await post(`/api/v3/jobs/${id}/applications`, student.token, {});
      const applicationId = applied.json().application.id;
      const url = `/api/v3/business/jobs/${id}/applications/${applicationId}`;

      const noted = await patch(url, alpha.token, { notes: "Call back Monday" });
      expect(noted.statusCode).toBe(200);
      expect(noted.json().application.notes).toBe("Call back Monday");
      expect(noted.json().application.stage).toBe("new");
      expect(noted.json().application.stage_changed_by).toBeNull();

      expect((await patch(url, alpha.token, {})).statusCode).toBe(400);
    });

    it("404s an application id that belongs to a different job", async () => {
      const jobA = await publishedJob(alpha, `Mismatch a ${suffix}`);
      const jobB = await publishedJob(alpha, `Mismatch b ${suffix}`);
      const applied = await post(`/api/v3/jobs/${jobA}/applications`, student.token, {});
      const res = await patch(
        `/api/v3/business/jobs/${jobB}/applications/${applied.json().application.id}`,
        alpha.token,
        { stage: "offer" },
      );
      expect(res.statusCode).toBe(404);
    });

    it("filters the applicant list by stage", async () => {
      const id = await publishedJob(alpha, `Stage filter ${suffix}`);
      const applied = await post(`/api/v3/jobs/${id}/applications`, student.token, {});
      await patch(
        `/api/v3/business/jobs/${id}/applications/${applied.json().application.id}`,
        alpha.token,
        { stage: "interview" },
      );
      const hit = await get(`/api/v3/business/jobs/${id}/applications?stage=interview`, alpha.token);
      expect(hit.json().data).toHaveLength(1);
      const miss = await get(`/api/v3/business/jobs/${id}/applications?stage=rejected`, alpha.token);
      expect(miss.json().data).toHaveLength(0);
    });

    it("rejects a stage outside V1's vocabulary", async () => {
      const id = await publishedJob(alpha, `Bad stage ${suffix}`);
      const applied = await post(`/api/v3/jobs/${id}/applications`, student.token, {});
      const res = await patch(
        `/api/v3/business/jobs/${id}/applications/${applied.json().application.id}`,
        alpha.token,
        { stage: "hired-ish" },
      );
      expect(res.statusCode).toBe(400);
    });

    it("shows a student only their own applications", async () => {
      const id = await publishedJob(alpha, `Mine ${suffix}`);
      await post(`/api/v3/jobs/${id}/applications`, student.token, {});

      const mine = await get("/api/v3/jobs/my-applications", student.token);
      expect(mine.statusCode).toBe(200);
      expect(mine.json().data.every((a: { user_id: number }) => a.user_id === student.id)).toBe(true);
      expect(mine.json().data.some((a: { job_id: number }) => a.job_id === id)).toBe(true);

      const theirs = await get("/api/v3/jobs/my-applications", student2.token);
      expect(theirs.json().data.some((a: { job_id: number }) => a.job_id === id)).toBe(false);
    });
  });

  // ── AI, fail-closed ────────────────────────────────────────────────────────

  describe("AI assist and match score", () => {
    it("rejects an unauthenticated caller before anything else", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/jobs/ai-assist",
        payload: { type: "cover_letter", context: {} },
      });
      expect(res.statusCode).toBe(401);
    });

    it("validates the assist type before reaching the provider", async () => {
      const res = await post("/api/v3/jobs/ai-assist", student.token, {
        type: "write_me_anything",
        context: { jobTitle: "Barista" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("503s on every V1 assist type when no API key is configured", async () => {
      for (const type of ["cover_letter", "optimize_post", "applicant_summary"]) {
        const res = await post("/api/v3/jobs/ai-assist", student.token, {
          type,
          context: { jobTitle: "Barista", companyName: "Alpha", jobDescription: "Make coffee" },
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().result).toBeUndefined();
      }
    });

    it("404s an unknown job on match-score — DB work runs before the provider", async () => {
      const res = await post("/api/v3/jobs/99999999/match-score", student.token);
      expect(res.statusCode).toBe(404);
    });

    it("404s a student with no profile — DB work runs before the provider", async () => {
      const id = await publishedJob(alpha, `No profile ${suffix}`);
      const res = await post(`/api/v3/jobs/${id}/match-score`, student2.token);
      expect(res.statusCode).toBe(404);
    });

    it("503s match-score rather than fabricating a score", async () => {
      const id = await publishedJob(alpha, `Match ${suffix}`);
      const res = await post(`/api/v3/jobs/${id}/match-score`, student.token);
      expect(res.statusCode).toBe(503);
      // V1 answered 200 {label:"Good Match", score:50} here. That is the defect
      // §1.6 forbids: no key must never look like a real assessment.
      expect(res.json().score).toBeUndefined();
      expect(res.json().label).toBeUndefined();
    });
  });

  // ── admin oversight ────────────────────────────────────────────────────────

  describe("admin monitoring", () => {
    it("refuses a non-admin", async () => {
      expect((await get("/api/v3/admin/monitoring/jobs", alpha.token)).statusCode).toBe(403);
      expect((await get("/api/v3/admin/monitoring/jobs/stats", student.token)).statusCode).toBe(403);
    });

    it("lists jobs across every business", async () => {
      const alphaTitle = `Cross alpha ${suffix}`;
      const betaTitle = `Cross beta ${suffix}`;
      await publishedJob(alpha, alphaTitle);
      await publishedJob(beta, betaTitle);

      const res = await get("/api/v3/admin/monitoring/jobs?limit=100", adminToken);
      expect(res.statusCode).toBe(200);
      const titles = res.json().data.map((j: { title: string }) => j.title);
      expect(titles).toContain(alphaTitle);
      expect(titles).toContain(betaTitle);
      // The employer card V2's admin list joins in.
      const row = res.json().data.find((j: { title: string }) => j.title === alphaTitle);
      expect(row.business_name).toBe(`Jobs alpha ${suffix}`);
    });

    it("narrows to one business and one status", async () => {
      const res = await get(
        `/api/v3/admin/monitoring/jobs?business_id=${beta.id}&status=open&limit=100`,
        adminToken,
      );
      expect(res.statusCode).toBe(200);
      expect(
        res.json().data.every((j: { business_id: number; status: string }) =>
          j.business_id === beta.id && j.status === "open",
        ),
      ).toBe(true);
    });

    it("narrows by title search, job type and category", async () => {
      const title = `Needle ${suffix}`;
      await publishedJob(alpha, title);
      const res = await get(
        `/api/v3/admin/monitoring/jobs?q=Needle&job_type=part_time&category=hospitality&limit=100`,
        adminToken,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().data.map((j: { title: string }) => j.title)).toContain(title);

      const miss = await get("/api/v3/admin/monitoring/jobs?category=aerospace", adminToken);
      expect(miss.json().data).toHaveLength(0);
      expect(miss.json().meta.total).toBe(0);
    });

    it("reports funnel counters", async () => {
      const res = await get("/api/v3/admin/monitoring/jobs/stats", adminToken);
      expect(res.statusCode).toBe(200);
      const stats = res.json();
      expect(stats.jobs.total).toBeGreaterThan(0);
      expect(stats.jobs.open).toBeGreaterThan(0);
      expect(stats.applications.total).toBeGreaterThan(0);
      expect(typeof stats.applications.last_7_days).toBe("number");
    });
  });
});
