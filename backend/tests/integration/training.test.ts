// Training (Wave G4): programs, chapters, the final assessment, enrolment,
// chapter progress, server-side grading, verifiable certificate issuance,
// XP/streak gamification, cross-tenant isolation and the public verifier.
//
// Everything runs offline — this module has no outbound dependency at all.
//
// Fixtures are built from scratch in beforeAll with a per-run suffix, so a
// sibling suite wiping the database cannot leave this one on stale rows.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("training", () => {
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
  let bizA: Biz;
  let bizB: Biz;

  let programA = 0;
  let programB = 0;
  let assessmentA = 0;
  let chapterIds: number[] = [];

  let learner = 0;
  let learnerToken = "";
  let outsider = 0;
  let outsiderToken = "";

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  // Four questions: pass = 3/4 (75), gold = 4/4 (100) against the defaults.
  const QUESTIONS = [
    { question: "Q1", options: ["a", "b"], correct_index: 1, explanation: "because b" },
    { question: "Q2", options: ["a", "b"], correct_index: 0 },
    { question: "Q3", options: ["a", "b", "c"], correct_index: 2 },
    { question: "Q4", options: ["a", "b"], correct_index: 1 },
  ];
  const ALL_CORRECT = { "0": 1, "1": 0, "2": 2, "3": 1 };
  const THREE_CORRECT = { "0": 1, "1": 0, "2": 2, "3": 0 };
  const ALL_WRONG = { "0": 0, "1": 1, "2": 0, "3": 0 };

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import(
      "../../src/core/plugins/request-context.plugin.js"
    );
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const trainingModule = await import("../../src/modules/training/index.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(trainingModule.default);
    });
    // Verification is registered OUTSIDE the auth scope, exactly as in server.ts.
    await app.register(trainingModule.publicCertificatesModule);
    await app.ready();

    suffix = `${process.pid}${Date.now() % 1_000_000}`;
    sign = (claims) =>
      jwt.sign({ email: "training@vitest.local", ...claims }, config.JWT_SECRET as string);
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });

    const makeUser = async (label: string, first = "Learner") => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: first,
          last_name: label,
          email: uniqueEmail(`train.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return row.id as number;
    };

    const makeBusiness = async (label: string): Promise<Biz> => {
      const ownerId = await makeUser(`owner.${label}`, "Owner");
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: ownerId,
          subdomain: `train-${label}-${suffix}`,
          business_name: `Train ${label} ${suffix}`,
          email: `train.${label}.${suffix}@vitest.local`,
          account_status: 1,
          status: "verified",
        })
        .returning(["id", "schema_name"]);
      return {
        id: row.id,
        schema: row.schema_name,
        ownerId,
        token: sign({ sub: String(ownerId), type: "platform_user", orgId: row.schema_name }),
      };
    };

    bizA = await makeBusiness("a");
    bizB = await makeBusiness("b");
    learner = await makeUser("learner", "Ada");
    learnerToken = sign({ sub: String(learner), type: "platform_user" });
    outsider = await makeUser("outsider", "Bob");
    outsiderToken = sign({ sub: String(outsider), type: "platform_user" });
  });

  afterAll(async () => {
    await app?.close();
    await masterKnex?.destroy();
    await shutdownPools?.();
  });

  // ── Programs ──────────────────────────────────────────────────────────────

  describe("programs", () => {
    it("creates a published program owned by the caller's business", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/business/training/programs",
        headers: auth(bizA.token),
        payload: {
          title: "Agent onboarding",
          description: "The basics",
          target_audience: "agents",
          passing_score: 70,
          max_attempts: 3,
          certificate_expiry_months: 12,
          is_published: true,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().business_id).toBe(bizA.id);
      expect(res.json().certificate_level_thresholds).toEqual({
        gold: 95,
        silver: 85,
        bronze: 70,
      });
      programA = res.json().id;

      const b = await app.inject({
        method: "POST",
        url: "/api/v3/business/training/programs",
        headers: auth(bizB.token),
        payload: { title: "B private course", is_published: true },
      });
      expect(b.statusCode).toBe(201);
      programB = b.json().id;
    });

    it("rejects a body that tries to set business_id itself", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/business/training/programs",
        headers: auth(bizA.token),
        payload: { title: "Spoof", business_id: bizB.id },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects a data: thumbnail URL", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/business/training/programs",
        headers: auth(bizA.token),
        payload: { title: "XSS", thumbnail_url: "data:text/html;base64,PHNjcmlwdD4=" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("requires business context", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/programs",
        headers: auth(learnerToken),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Cross-tenant isolation ────────────────────────────────────────────────

  describe("cross-tenant isolation", () => {
    it("business A never sees business B's programs", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/programs?limit=100",
        headers: auth(bizA.token),
      });
      const ids = res.json().data.map((p: { id: number }) => p.id);
      expect(ids).toContain(programA);
      expect(ids).not.toContain(programB);
    });

    it("404s (not 403s) on every nested read of another business's program", async () => {
      for (const url of [
        `/api/v3/business/training/programs/${programB}`,
        `/api/v3/business/training/programs/${programB}/chapters`,
        `/api/v3/business/training/programs/${programB}/assessment`,
        `/api/v3/business/training/programs/${programB}/assignments`,
        `/api/v3/business/training/programs/${programB}/roster`,
      ]) {
        const res = await app.inject({ method: "GET", url, headers: auth(bizA.token) });
        expect(res.statusCode, url).toBe(404);
      }
    });

    it("404s when A tries to write chapters, an assessment or enrolments into B's program", async () => {
      const chapters = await app.inject({
        method: "PUT",
        url: `/api/v3/business/training/programs/${programB}/chapters`,
        headers: auth(bizA.token),
        payload: { chapters: [{ title: "hijack" }] },
      });
      expect(chapters.statusCode).toBe(404);

      const assessment = await app.inject({
        method: "PUT",
        url: `/api/v3/business/training/programs/${programB}/assessment`,
        headers: auth(bizA.token),
        payload: { questions: QUESTIONS, passing_score: 1 },
      });
      expect(assessment.statusCode).toBe(404);

      const assign = await app.inject({
        method: "POST",
        url: `/api/v3/business/training/programs/${programB}/assignments`,
        headers: auth(bizA.token),
        payload: { user_ids: [learner] },
      });
      expect(assign.statusCode).toBe(404);

      expect(await masterKnex("training_chapters").where({ program_id: programB })).toHaveLength(0);
      expect(await masterKnex("training_assessments").where({ program_id: programB })).toHaveLength(
        0,
      );
      expect(
        await masterKnex("training_assignments").where({ program_id: programB }),
      ).toHaveLength(0);
    });
  });

  // ── Authoring ─────────────────────────────────────────────────────────────

  describe("chapters and assessment", () => {
    it("replaces the ordered chapter list in one PUT", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/api/v3/business/training/programs/${programA}/chapters`,
        headers: auth(bizA.token),
        payload: {
          chapters: [
            { title: "Welcome", content_text: "Hello" },
            { title: "Compliance", content_text: "Rules" },
            { title: "Wrap up" },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const chapters = res.json().data;
      expect(chapters.map((c: { title: string }) => c.title)).toEqual([
        "Welcome",
        "Compliance",
        "Wrap up",
      ]);
      expect(chapters.map((c: { sort_order: number }) => c.sort_order)).toEqual([0, 1, 2]);
      chapterIds = chapters.map((c: { id: number }) => c.id);
    });

    it("keeps chapters that carry an id and drops the rest", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/api/v3/business/training/programs/${programA}/chapters`,
        headers: auth(bizA.token),
        payload: {
          chapters: [
            { id: chapterIds[0], title: "Welcome (v2)" },
            { id: chapterIds[1], title: "Compliance" },
            { id: chapterIds[2], title: "Wrap up" },
          ],
        },
      });
      const chapters = res.json().data;
      expect(chapters).toHaveLength(3);
      expect(chapters[0].id).toBe(chapterIds[0]);
      expect(chapters[0].title).toBe("Welcome (v2)");
    });

    it("stores one assessment per program and rejects an out-of-range correct_index", async () => {
      const bad = await app.inject({
        method: "PUT",
        url: `/api/v3/business/training/programs/${programA}/assessment`,
        headers: auth(bizA.token),
        payload: {
          questions: [{ question: "Q", options: ["a", "b"], correct_index: 5 }],
          passing_score: 70,
        },
      });
      expect(bad.statusCode).toBe(400);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v3/business/training/programs/${programA}/assessment`,
        headers: auth(bizA.token),
        payload: { questions: QUESTIONS, passing_score: 70 },
      });
      expect(res.statusCode).toBe(200);
      assessmentA = res.json().assessment.id;

      // A second PUT replaces rather than duplicating.
      await app.inject({
        method: "PUT",
        url: `/api/v3/business/training/programs/${programA}/assessment`,
        headers: auth(bizA.token),
        payload: { questions: QUESTIONS, passing_score: 70 },
      });
      expect(await masterKnex("training_assessments").where({ program_id: programA })).toHaveLength(
        1,
      );
    });

    it("shows the author the correct answers", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/business/training/programs/${programA}/assessment`,
        headers: auth(bizA.token),
      });
      expect(res.json().assessment.questions[0].correct_index).toBe(1);
    });
  });

  // ── Enrolment ─────────────────────────────────────────────────────────────

  describe("enrolment", () => {
    it("assigns learners idempotently", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v3/business/training/programs/${programA}/assignments`,
        headers: auth(bizA.token),
        payload: { user_ids: [learner] },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().assigned).toBe(1);

      const again = await app.inject({
        method: "POST",
        url: `/api/v3/business/training/programs/${programA}/assignments`,
        headers: auth(bizA.token),
        payload: { user_ids: [learner] },
      });
      expect(again.json().assigned).toBe(0);
      expect(
        await masterKnex("training_assignments").where({ program_id: programA, user_id: learner }),
      ).toHaveLength(1);
    });

    it("lists the learner's assignments with chapter completion counts", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/assignments",
        headers: auth(learnerToken),
      });
      expect(res.statusCode).toBe(200);
      const mine = res.json().data.find((a: { program_id: number }) => a.program_id === programA);
      expect(mine).toBeTruthy();
      expect(mine.program.title).toBe("Agent onboarding");
      expect(mine.total_chapters).toBe(3);
      expect(mine.completed_chapters).toBe(0);
    });

    it("marks a chapter complete, idempotently", async () => {
      for (const id of chapterIds) {
        const res = await app.inject({
          method: "POST",
          url: "/api/v3/me/training/progress",
          headers: auth(learnerToken),
          payload: { program_id: programA, chapter_id: id },
        });
        expect(res.statusCode).toBe(200);
      }
      // Same chapter twice must not create a second progress row.
      await app.inject({
        method: "POST",
        url: "/api/v3/me/training/progress",
        headers: auth(learnerToken),
        payload: { program_id: programA, chapter_id: chapterIds[0] },
      });
      const rows = await masterKnex("training_progress").where({
        user_id: learner,
        program_id: programA,
      });
      expect(rows).toHaveLength(3);

      const list = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/assignments",
        headers: auth(learnerToken),
      });
      const mine = list.json().data.find((a: { program_id: number }) => a.program_id === programA);
      expect(mine.completed_chapters).toBe(3);
    });

    it("404s when a chapter does not belong to the named program", async () => {
      const [stray] = await masterKnex("training_chapters")
        .insert({ program_id: programB, title: "Elsewhere", sort_order: 0 })
        .returning(["id"]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/training/progress",
        headers: auth(learnerToken),
        payload: { program_id: programA, chapter_id: stray.id },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Grading + certificates ────────────────────────────────────────────────

  describe("assessment grading", () => {
    it("never sends the correct answers to a learner", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/me/training/programs/${programA}/assessment`,
        headers: auth(learnerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain("correct_index");
      expect(res.body).not.toContain("because b");
      for (const q of res.json().assessment.questions) {
        expect(q).not.toHaveProperty("correct_index");
        expect(q).not.toHaveProperty("explanation");
        expect(Array.isArray(q.options)).toBe(true);
      }
    });

    it("records a failing attempt without issuing a certificate", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${assessmentA}/submit`,
        headers: auth(learnerToken),
        payload: { program_id: programA, answers: ALL_WRONG },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ score: 0, passed: false, level: null, certificate: null });
      expect(
        await masterKnex("training_certificates").where({ user_id: learner, program_id: programA }),
      ).toHaveLength(0);
    });

    it("grades from the server's answers — a spoofed body cannot self-certify", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${assessmentA}/submit`,
        headers: auth(learnerToken),
        payload: {
          program_id: programA,
          answers: ALL_WRONG,
          score: 100,
          passed: true,
          level: "gold",
        },
      });
      // A strict body rejects the extra keys outright.
      expect(res.statusCode).toBe(400);
    });

    it("issues a levelled, verifiable certificate on a pass and awards XP", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${assessmentA}/submit`,
        headers: auth(learnerToken),
        payload: { program_id: programA, answers: THREE_CORRECT },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.score).toBe(75);
      expect(body.passed).toBe(true);
      expect(body.level).toBe("bronze");
      expect(body.attempt_number).toBe(2);
      expect(body.certificate.verification_code).toMatch(/^GC-[0-9A-F]{20}$/);
      // certificate_expiry_months = 12 → an expiry is set.
      expect(body.certificate.expires_at).not.toBeNull();

      const xp = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/gamification",
        headers: auth(learnerToken),
      });
      expect(xp.json().total_xp).toBe(25); // bronze
      expect(xp.json().current_streak).toBe(1);
      expect(xp.json().badges.map((b: { id: string }) => b.id)).toContain("first_course");
    });

    it("409s a resubmission while an active certificate stands", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${assessmentA}/submit`,
        headers: auth(learnerToken),
        payload: { program_id: programA, answers: ALL_CORRECT },
      });
      expect(res.statusCode).toBe(409);
      expect(
        await masterKnex("training_certificates").where({ user_id: learner, program_id: programA }),
      ).toHaveLength(1);
    });

    it("enforces the attempt cap and the retake flag", async () => {
      const [prog] = await masterKnex("training_programs")
        .insert({
          business_id: bizA.id,
          title: `Capped ${suffix}`,
          passing_score: 70,
          max_attempts: 1,
          retake_allowed: false,
          is_published: true,
        })
        .returning(["id"]);
      const [ass] = await masterKnex("training_assessments")
        .insert({
          program_id: prog.id,
          title: "Final",
          questions: JSON.stringify(QUESTIONS),
          passing_score: 70,
        })
        .returning(["id"]);

      const first = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${ass.id}/submit`,
        headers: auth(learnerToken),
        payload: { program_id: prog.id, answers: ALL_WRONG },
      });
      expect(first.json().passed).toBe(false);

      const second = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${ass.id}/submit`,
        headers: auth(learnerToken),
        payload: { program_id: prog.id, answers: ALL_CORRECT },
      });
      expect(second.statusCode).toBe(400);
      expect(second.json().error ?? second.json().message).toMatch(/attempt/i);
    });

    it("404s when the assessment does not belong to the named program", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${assessmentA}/submit`,
        headers: auth(learnerToken),
        payload: { program_id: programB, answers: ALL_CORRECT },
      });
      expect(res.statusCode).toBe(404);
    });

    it("hides an unpublished program from a learner who was never assigned it", async () => {
      await masterKnex("training_programs").where({ id: programB }).update({ is_published: false });
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/me/training/programs/${programB}`,
        headers: auth(outsiderToken),
      });
      expect(res.statusCode).toBe(404);
    });

    it("still serves an assigned learner a program that was later unpublished", async () => {
      await masterKnex("training_programs").where({ id: programA }).update({ is_published: false });
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/me/training/programs/${programA}`,
        headers: auth(learnerToken),
      });
      expect(res.statusCode).toBe(200);
      await masterKnex("training_programs").where({ id: programA }).update({ is_published: true });
    });
  });

  // ── Public verification ───────────────────────────────────────────────────

  describe("public certificate verification", () => {
    let code = "";

    beforeAll(async () => {
      const row = await masterKnex("training_certificates")
        .where({ user_id: learner, program_id: programA })
        .first();
      code = row.verification_code;
    });

    it("verifies a real certificate with no auth", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v3/certificates/verify/${code}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(true);
      expect(body.level).toBe("bronze");
      expect(body.score).toBe(75);
      expect(body.program_title).toBe("Agent onboarding");
      expect(body.issued_by).toContain("Train a");
      expect(body.holder_name).toBe("Ada learner");
    });

    it("leaks no identifiers or contact details", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v3/certificates/verify/${code}` });
      const body = res.json();
      for (const forbidden of [
        "id",
        "user_id",
        "program_id",
        "business_id",
        "email",
        "phone",
        "holder_email",
      ]) {
        expect(body).not.toHaveProperty(forbidden);
      }
      expect(res.body).not.toContain("vitest.local");
      expect(res.body).not.toContain("@");
    });

    it("404s an unknown code", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/certificates/verify/GC-DOESNOTEXIST0000000`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("reports a revoked certificate as real but not valid", async () => {
      await masterKnex("training_certificates")
        .where({ verification_code: code })
        .update({ is_expired: true });
      const res = await app.inject({ method: "GET", url: `/api/v3/certificates/verify/${code}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().valid).toBe(false);
      expect(res.json().level).toBe("bronze");
      await masterKnex("training_certificates")
        .where({ verification_code: code })
        .update({ is_expired: false });
    });

    it("reports a lapsed expiry as not valid", async () => {
      await masterKnex("training_certificates")
        .where({ verification_code: code })
        .update({ expires_at: new Date(Date.now() - 86_400_000) });
      const res = await app.inject({ method: "GET", url: `/api/v3/certificates/verify/${code}` });
      expect(res.json().valid).toBe(false);
      await masterKnex("training_certificates")
        .where({ verification_code: code })
        .update({ expires_at: new Date(Date.now() + 86_400_000) });
    });

    it("keeps at most one live certificate per (learner, program)", async () => {
      await expect(
        masterKnex("training_certificates").insert({
          user_id: learner,
          program_id: programA,
          level: "gold",
          score: 100,
          verification_code: `GC-DUP${suffix}`,
        }),
      ).rejects.toThrow();
    });
  });

  // ── Business roster, leaderboard, stats ───────────────────────────────────

  describe("business reporting", () => {
    it("returns the roster with learner names and their certificates", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/business/training/programs/${programA}/roster`,
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.enrollments.map((e: { user_id: number }) => e.user_id)).toContain(learner);
      expect(body.progress.length).toBe(3);
      expect(body.certificates.length).toBe(1);
      expect(body.learners.map((l: { id: number }) => l.id)).toContain(learner);
    });

    it("ranks only learners this business enrolled", async () => {
      // A learner with XP who belongs to no programme of A's must not appear.
      await masterKnex("training_gamification").insert({
        user_id: outsider,
        total_xp: 9999,
        current_streak: 1,
        longest_streak: 1,
        badges: JSON.stringify([]),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/leaderboard",
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.map((r: { user_id: number }) => r.user_id);
      expect(ids).toContain(learner);
      expect(ids).not.toContain(outsider);

      const emptyForB = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/leaderboard",
        headers: auth(bizB.token),
      });
      expect(emptyForB.json().data).toHaveLength(0);
    });

    it("reports enrolment stats scoped to the business", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/stats",
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().programs).toBeGreaterThanOrEqual(2);
      expect(res.json().enrolments.total).toBeGreaterThanOrEqual(1);
      expect(res.json().certificates_issued).toBeGreaterThanOrEqual(1);

      const b = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/stats",
        headers: auth(bizB.token),
      });
      expect(b.json().enrolments.total).toBe(0);
    });
  });

  // ── Filters, empty shapes and defaults ────────────────────────────────────
  //
  // The conditional branches the happy path never reaches: optional query
  // filters, a business with no programs at all, a learner with no XP row, a
  // program with no assessment, and the soft-delete path.

  describe("filters and edge shapes", () => {
    let emptyBiz: Biz;

    beforeAll(async () => {
      const [ownerRow] = await masterKnex("platform_users")
        .insert({
          first_name: "Owner",
          last_name: "empty",
          email: uniqueEmail("train.owner.empty"),
          account_status: 1,
        })
        .returning(["id"]);
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: ownerRow.id,
          subdomain: `train-empty-${suffix}`,
          business_name: `Train empty ${suffix}`,
          account_status: 1,
          status: "verified",
        })
        .returning(["id", "schema_name"]);
      emptyBiz = {
        id: row.id,
        schema: row.schema_name,
        ownerId: ownerRow.id,
        token: sign({ sub: String(ownerRow.id), type: "platform_user", orgId: row.schema_name }),
      };
    });

    it("filters the program list by audience and publication state", async () => {
      const agents = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/programs?target_audience=agents&limit=100",
        headers: auth(bizA.token),
      });
      expect(
        agents.json().data.every((p: { target_audience: string }) => p.target_audience === "agents"),
      ).toBe(true);

      const published = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/programs?is_published=true&limit=100",
        headers: auth(bizA.token),
      });
      expect(published.json().data.every((p: { is_published: boolean }) => p.is_published)).toBe(
        true,
      );

      const students = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/programs?target_audience=students&limit=100",
        headers: auth(bizA.token),
      });
      expect(students.json().data.map((p: { id: number }) => p.id)).not.toContain(programA);
    });

    it("returns zeroed stats and an empty leaderboard for a business with no programs", async () => {
      const stats = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/stats",
        headers: auth(emptyBiz.token),
      });
      expect(stats.json()).toEqual({
        programs: 0,
        enrolments: { total: 0, this_month: 0, closed: 0 },
        certificates_issued: 0,
      });

      const board = await app.inject({
        method: "GET",
        url: "/api/v3/business/training/leaderboard",
        headers: auth(emptyBiz.token),
      });
      expect(board.json().data).toHaveLength(0);
    });

    it("updates certificate thresholds and other program fields", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v3/business/training/programs/${programA}`,
        headers: auth(bizA.token),
        payload: {
          description: "Revised",
          certificate_level_thresholds: { gold: 90, silver: 80, bronze: 60 },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().description).toBe("Revised");
      expect(res.json().certificate_level_thresholds).toEqual({
        gold: 90,
        silver: 80,
        bronze: 60,
      });
    });

    it("returns a null assessment for a program that has none", async () => {
      const [bare] = await masterKnex("training_programs")
        .insert({ business_id: bizA.id, title: `Bare ${suffix}`, is_published: true })
        .returning(["id"]);
      await masterKnex("training_assignments").insert({ program_id: bare.id, user_id: learner });

      const asAuthor = await app.inject({
        method: "GET",
        url: `/api/v3/business/training/programs/${bare.id}/assessment`,
        headers: auth(bizA.token),
      });
      expect(asAuthor.json().assessment).toBeNull();

      const asLearner = await app.inject({
        method: "GET",
        url: `/api/v3/me/training/programs/${bare.id}/assessment`,
        headers: auth(learnerToken),
      });
      expect(asLearner.json().assessment).toBeNull();

      const progress = await app.inject({
        method: "GET",
        url: `/api/v3/me/training/programs/${bare.id}/progress`,
        headers: auth(learnerToken),
      });
      expect(progress.json()).toEqual({ progress: [], attempts: [] });
    });

    it("returns a zeroed gamification row for a learner who has earned nothing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/gamification",
        headers: auth(outsiderToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total_xp).toBe(9999); // seeded by the leaderboard test

      const [fresh] = await masterKnex("platform_users")
        .insert({
          first_name: "Fresh",
          last_name: "learner",
          email: uniqueEmail("train.fresh"),
          account_status: 1,
        })
        .returning(["id"]);
      const freshToken = sign({ sub: String(fresh.id), type: "platform_user" });
      const zeroed = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/gamification",
        headers: auth(freshToken),
      });
      expect(zeroed.json()).toMatchObject({ total_xp: 0, current_streak: 0, badges: [] });

      const noAssignments = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/assignments",
        headers: auth(freshToken),
      });
      expect(noAssignments.json().data).toHaveLength(0);

      const noCerts = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/certificates",
        headers: auth(freshToken),
      });
      expect(noCerts.json().data).toHaveLength(0);
    });

    it("lists the learner's own certificates", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/certificates",
        headers: auth(learnerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].verification_code).toMatch(/^GC-/);
    });

    it("unpublishes on delete rather than dropping the course", async () => {
      const [doomed] = await masterKnex("training_programs")
        .insert({ business_id: bizA.id, title: `Doomed ${suffix}`, is_published: true })
        .returning(["id"]);
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v3/business/training/programs/${doomed.id}`,
        headers: auth(bizA.token),
      });
      expect(res.json()).toEqual({ deleted: true });
      const row = await masterKnex("training_programs").where({ id: doomed.id }).first();
      expect(row.is_published).toBe(false);
      expect(row.deleted_at).not.toBeNull();

      const gone = await app.inject({
        method: "DELETE",
        url: `/api/v3/business/training/programs/${doomed.id}`,
        headers: auth(bizA.token),
      });
      expect(gone.statusCode).toBe(404);
    });

    it("404s a learner read of a program that does not exist", async () => {
      for (const url of [
        "/api/v3/me/training/programs/99999999",
        "/api/v3/me/training/programs/99999999/progress",
        "/api/v3/me/training/programs/99999999/assessment",
      ]) {
        const res = await app.inject({ method: "GET", url, headers: auth(learnerToken) });
        expect(res.statusCode, url).toBe(404);
      }
      const submit = await app.inject({
        method: "POST",
        url: "/api/v3/me/training/assessments/99999999/submit",
        headers: auth(learnerToken),
        payload: { program_id: programA, answers: ALL_CORRECT },
      });
      expect(submit.statusCode).toBe(404);
    });

    it("falls back to 3 attempts when a program leaves max_attempts null", async () => {
      const [prog] = await masterKnex("training_programs")
        .insert({
          business_id: bizA.id,
          title: `Unlimited ${suffix}`,
          passing_score: 70,
          max_attempts: null,
          is_published: true,
        })
        .returning(["id"]);
      const [ass] = await masterKnex("training_assessments")
        .insert({
          program_id: prog.id,
          title: "Final",
          questions: JSON.stringify(QUESTIONS),
          passing_score: 70,
        })
        .returning(["id"]);

      for (let i = 0; i < 3; i += 1) {
        const res = await app.inject({
          method: "POST",
          url: `/api/v3/me/training/assessments/${ass.id}/submit`,
          headers: auth(learnerToken),
          payload: { program_id: prog.id, answers: ALL_WRONG },
        });
        expect(res.json().attempt_number).toBe(i + 1);
      }
      const capped = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${ass.id}/submit`,
        headers: auth(learnerToken),
        payload: { program_id: prog.id, answers: ALL_CORRECT },
      });
      expect(capped.statusCode).toBe(400);
    });

    it("issues a certificate with no expiry when the program sets none", async () => {
      const [prog] = await masterKnex("training_programs")
        .insert({
          business_id: bizA.id,
          title: `Forever ${suffix}`,
          passing_score: 70,
          certificate_expiry_months: null,
          is_published: true,
        })
        .returning(["id"]);
      const [ass] = await masterKnex("training_assessments")
        .insert({
          program_id: prog.id,
          title: "Final",
          questions: JSON.stringify(QUESTIONS),
          passing_score: 70,
        })
        .returning(["id"]);

      const res = await app.inject({
        method: "POST",
        url: `/api/v3/me/training/assessments/${ass.id}/submit`,
        headers: auth(learnerToken),
        payload: { program_id: prog.id, answers: ALL_CORRECT },
      });
      expect(res.json().level).toBe("gold");
      expect(res.json().certificate.expires_at).toBeNull();

      // Second pass on the same day: the streak holds and XP accumulates.
      const xp = await app.inject({
        method: "GET",
        url: "/api/v3/me/training/gamification",
        headers: auth(learnerToken),
      });
      expect(xp.json().total_xp).toBe(75); // bronze 25 + gold 50
      expect(xp.json().current_streak).toBe(1);
    });

    it("defaults the assessment title and accepts a due date on assignment", async () => {
      const [prog] = await masterKnex("training_programs")
        .insert({ business_id: bizA.id, title: `Untitled ${suffix}`, is_published: true })
        .returning(["id"]);

      const put = await app.inject({
        method: "PUT",
        url: `/api/v3/business/training/programs/${prog.id}/assessment`,
        headers: auth(bizA.token),
        payload: { questions: QUESTIONS, passing_score: 70 },
      });
      expect(put.json().assessment.title).toBe("Final assessment");

      const assigned = await app.inject({
        method: "POST",
        url: `/api/v3/business/training/programs/${prog.id}/assignments`,
        headers: auth(bizA.token),
        payload: { user_ids: [outsider], due_date: "2027-01-31T00:00:00.000Z" },
      });
      expect(assigned.json().assigned).toBe(1);

      const list = await app.inject({
        method: "GET",
        url: `/api/v3/business/training/programs/${prog.id}/assignments`,
        headers: auth(bizA.token),
      });
      expect(list.json().data[0].due_date).not.toBeNull();
    });

    it("filters the admin list by business and audience", async () => {
      const byBusiness = await app.inject({
        method: "GET",
        url: `/api/v3/admin/monitoring/training?business_id=${bizA.id}&limit=100`,
        headers: auth(adminToken),
      });
      expect(
        byBusiness.json().data.every((r: { business_id: number }) => r.business_id === bizA.id),
      ).toBe(true);

      const byAudience = await app.inject({
        method: "GET",
        url: "/api/v3/admin/monitoring/training?target_audience=agents&limit=100",
        headers: auth(adminToken),
      });
      expect(
        byAudience
          .json()
          .data.every((r: { target_audience: string }) => r.target_audience === "agents"),
      ).toBe(true);
    });
  });

  // ── Admin monitoring ──────────────────────────────────────────────────────

  describe("admin monitoring", () => {
    it("requires an admin token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/monitoring/training",
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(403);
    });

    it("lists programs across every business with their counters", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/monitoring/training?limit=100",
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const row = res.json().data.find((r: { id: number }) => r.id === programA);
      expect(row).toBeTruthy();
      expect(row.business_name).toContain("Train a");
      expect(row.chapters).toBe(3);
      expect(row.enrolments).toBeGreaterThanOrEqual(1);
      expect(row.certificates_issued).toBeGreaterThanOrEqual(1);
    });

    it("reports platform training stats", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/monitoring/training/stats",
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.programs.total).toBeGreaterThanOrEqual(2);
      expect(body.certificates.total).toBeGreaterThanOrEqual(1);
      expect(body.gamification.learners).toBeGreaterThanOrEqual(1);
    });
  });
});
