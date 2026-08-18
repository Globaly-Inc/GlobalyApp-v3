// LMS delivery (Wave E4) — the gap Wave G4 named and left: assignment
// submissions, per-chapter quizzes, the lesson-task definition that makes both
// authorable, enrolment applications and email invitations.
//
// Behavioural spec: V2 routes/business-training.ts (submissions + grade),
// routes/lms-enrollment.ts, routes/lms-invitations.ts, routes/lms-quiz.ts,
// routes/lms-student.ts, and V1's lms-course-invite. Where those disagree with
// each other or with themselves, the corrected behaviour is asserted and the
// defect is cited (D-E4-n, referenced at each fix site in the source).
//
// Everything runs offline. There is no provider on any path here.
//
// tests/integration/training.test.ts owns G4's surface; this file owns only what
// E4 added, plus the one G4 read E4 changed (the learner chapter projection,
// which must not leak the quiz answer key the new column introduced).

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const BIZ = "/api/v3/business/training";
const ME = "/api/v3/me/training";

describeDb("lms delivery", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let sign: (claims: Record<string, unknown>) => string;

  interface Biz {
    id: number;
    schema: string;
    ownerId: number;
    token: string;
  }
  let bizA: Biz;
  let bizB: Biz;

  let learnerId = 0;
  let learnerToken = "";
  let outsiderId = 0;
  let outsiderToken = "";

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) =>
    app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: payload ?? {} });
  const put = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "PUT", url, headers: auth(token), payload: payload ?? {} });
  const del = (url: string, token: string) =>
    app.inject({ method: "DELETE", url, headers: auth(token) });

  const QUIZ = {
    passing_score: 70,
    questions: [
      { question: "Q1", options: ["a", "b"], correct_index: 1 },
      { question: "Q2", options: ["a", "b"], correct_index: 0 },
      { question: "Q3", options: ["a", "b", "c"], correct_index: 2 },
      { question: "Q4", options: ["a", "b"], correct_index: 1 },
    ],
  };
  const ALL_CORRECT = { "0": 1, "1": 0, "2": 2, "3": 1 };
  const ONE_CORRECT = { "0": 1, "1": 1, "2": 0, "3": 0 };

  const ASSIGNMENT = {
    instruction: "Write 400 words on your motivation for studying abroad.",
    accepted_types: ["pdf", "docx"],
    due_date: "2026-12-01T00:00:00.000Z",
  };

  /** Create a published programme with two chapters. Returns their ids. */
  async function newProgram(biz: Biz, title: string) {
    const created = await post(`${BIZ}/programs`, biz.token, {
      title,
      target_audience: "students",
      is_published: true,
    });
    expect(created.statusCode).toBe(201);
    const programId = created.json().id as number;

    const chapters = await put(`${BIZ}/programs/${programId}/chapters`, biz.token, {
      chapters: [{ title: "Lesson one" }, { title: "Lesson two" }],
    });
    expect(chapters.statusCode).toBe(200);
    const chapterIds = chapters.json().data.map((c: { id: number }) => c.id) as number[];
    return { programId, chapterIds };
  }

  async function enrol(biz: Biz, programId: number, userId: number) {
    const res = await post(`${BIZ}/programs/${programId}/assignments`, biz.token, {
      user_ids: [userId],
    });
    expect(res.statusCode).toBe(201);
  }

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, string>;
    };
    const { provisionBusinessSchema } = await import("../../src/core/business/provisioner.js");
    const { createSchemaKnex, schemaName } = await import("../../src/core/db/knex.js");
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import(
      "../../src/core/plugins/request-context.plugin.js"
    );
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const trainingModule = (await import("../../src/modules/training/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(trainingModule);
    });
    await app.ready();

    const suffix = `${process.pid}${Date.now() % 1_000_000}`;
    sign = (claims) => jwt.sign({ email: "lms@vitest.local", ...claims }, config.JWT_SECRET);

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Lms",
          last_name: label,
          email: uniqueEmail(`lms.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return row.id as number;
    };

    const newBiz = async (label: string): Promise<Biz> => {
      const ownerId = await newUser(label);
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: ownerId,
          subdomain: `lms-${label}-${suffix}`,
          business_name: `Lms ${label} ${suffix}`,
          business_type: "agency",
          account_status: 1,
          status: "active",
        })
        .returning(["id", "schema_name"]);
      await provisionBusinessSchema(row.schema_name);
      const tenant = createSchemaKnex(schemaName(row.schema_name), { min: 0, max: 1 });
      try {
        const role = await tenant("roles").first("id");
        await tenant("agents").insert({
          platform_user_id: ownerId,
          role_id: role.id,
          is_owner: true,
        });
      } finally {
        await tenant.destroy();
      }
      return {
        id: row.id as number,
        schema: row.schema_name as string,
        ownerId,
        token: sign({ sub: String(ownerId), type: "platform_user", orgId: row.schema_name }),
      };
    };

    bizA = await newBiz("a");
    bizB = await newBiz("b");

    learnerId = await newUser("learner");
    learnerToken = sign({ sub: String(learnerId), type: "platform_user" });
    outsiderId = await newUser("outsider");
    outsiderToken = sign({ sub: String(outsiderId), type: "platform_user" });
  });

  afterAll(async () => {
    if (masterKnex) {
      for (const biz of [bizA, bizB]) {
        if (biz?.schema) await masterKnex.raw(`DROP SCHEMA IF EXISTS "${biz.schema}" CASCADE`);
      }
      await masterKnex("training_programs")
        .whereIn("business_id", [bizA?.id, bizB?.id].filter(Boolean) as number[])
        .del();
      await masterKnex("businesses")
        .whereIn("id", [bizA?.id, bizB?.id].filter(Boolean) as number[])
        .del();
      await masterKnex("platform_users")
        .whereIn("id", [learnerId, outsiderId].filter(Boolean))
        .del();
    }
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── The lesson task definition ────────────────────────────────────────────

  describe("chapter attachments", () => {
    it("authors an assignment brief and a quiz on a chapter", async () => {
      const { programId, chapterIds } = await newProgram(bizA, "Attachments A");
      // V2 could not do this at all: `attachments` was absent from both its
      // chapter GET projection and its chapter PUT body (D-E4-1).
      const res = await put(
        `${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`,
        bizA.token,
        { attachments: { assignment: ASSIGNMENT, quiz: QUIZ } },
      );
      expect(res.statusCode).toBe(200);

      const read = await get(
        `${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`,
        bizA.token,
      );
      expect(read.json().chapter.attachments.assignment.instruction).toBe(ASSIGNMENT.instruction);
      // The author wrote the answers, so the author sees them.
      expect(read.json().chapter.attachments.quiz.questions[0].correct_index).toBe(1);
    });

    it("survives a chapter reorder", async () => {
      const { programId, chapterIds } = await newProgram(bizA, "Attachments survive");
      await put(`${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`, bizA.token, {
        attachments: { assignment: ASSIGNMENT },
      });
      // V2's chapter PUT builds its update row without `attachments`, which is
      // why the brief is authored on its own route rather than inside that body.
      await put(`${BIZ}/programs/${programId}/chapters`, bizA.token, {
        chapters: [
          { id: chapterIds[1], title: "Lesson two moved first" },
          { id: chapterIds[0], title: "Lesson one" },
        ],
      });
      const read = await get(
        `${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`,
        bizA.token,
      );
      expect(read.json().chapter.attachments.assignment.instruction).toBe(ASSIGNMENT.instruction);
    });

    it("rejects a quiz whose correct_index is out of range", async () => {
      const { programId, chapterIds } = await newProgram(bizA, "Bad quiz");
      const res = await put(
        `${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`,
        bizA.token,
        {
          attachments: {
            quiz: { questions: [{ question: "Q", options: ["a", "b"], correct_index: 5 }] },
          },
        },
      );
      expect(res.statusCode).toBe(400);
    });

    it("404s a chapter that belongs to another programme", async () => {
      const a = await newProgram(bizA, "Chapter owner A");
      const b = await newProgram(bizA, "Chapter owner B");
      const res = await put(
        `${BIZ}/programs/${a.programId}/chapters/${b.chapterIds[0]}/attachments`,
        bizA.token,
        { attachments: { assignment: ASSIGNMENT } },
      );
      expect(res.statusCode).toBe(404);
    });
  });

  // ── The learner's view must not carry the answer key ───────────────────────

  describe("learner chapter projection", () => {
    it("never returns correct_index to a learner", async () => {
      const { programId, chapterIds } = await newProgram(bizA, "No leak");
      await put(`${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`, bizA.token, {
        attachments: { assignment: ASSIGNMENT, quiz: QUIZ },
      });
      await enrol(bizA, programId, learnerId);

      const res = await get(`${ME}/programs/${programId}`, learnerToken);
      expect(res.statusCode).toBe(200);
      // The E4 column holds the answer key and G4's chapter read selected every
      // column, so a passthrough would have leaked every answer on day one.
      expect(JSON.stringify(res.json())).not.toContain("correct_index");
      const chapter = res
        .json()
        .chapters.find((c: { id: number }) => c.id === chapterIds[0]);
      expect(chapter).not.toHaveProperty("attachments");
      // The brief IS visible — the learner has to read it to do the work.
      expect(chapter.assignment.instruction).toBe(ASSIGNMENT.instruction);
      expect(chapter.quiz).toEqual({ passing_score: 70, question_count: 4 });
    });

    it("strips answers from the learner's quiz read", async () => {
      const { programId, chapterIds } = await newProgram(bizA, "Quiz read");
      await put(`${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`, bizA.token, {
        attachments: { quiz: QUIZ },
      });
      await enrol(bizA, programId, learnerId);

      const res = await get(
        `${ME}/programs/${programId}/chapters/${chapterIds[0]}/quiz`,
        learnerToken,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().questions).toEqual([
        { question: "Q1", options: ["a", "b"] },
        { question: "Q2", options: ["a", "b"] },
        { question: "Q3", options: ["a", "b", "c"] },
        { question: "Q4", options: ["a", "b"] },
      ]);
      expect(JSON.stringify(res.json())).not.toContain("correct_index");
    });
  });

  // ── Assignment submissions ────────────────────────────────────────────────

  describe("assignment submissions", () => {
    async function ready(title: string) {
      const { programId, chapterIds } = await newProgram(bizA, title);
      await put(`${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`, bizA.token, {
        attachments: { assignment: ASSIGNMENT },
      });
      await enrol(bizA, programId, learnerId);
      return { programId, chapterId: chapterIds[0], otherChapterId: chapterIds[1] };
    }

    it("accepts a submission from an enrolled learner", async () => {
      const { programId, chapterId } = await ready("Submit ok");
      const res = await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        submission_text: "Here is my motivation essay.",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().submission).toMatchObject({
        status: "submitted",
        attempt_number: 1,
        user_id: learnerId,
      });
    });

    it("does NOT complete the lesson on submission", async () => {
      const { programId, chapterId } = await ready("Submit no complete");
      await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        submission_text: "essay",
      });
      // V1 fired markComplete in the same click handler as the submit, so the
      // lesson was complete before anyone looked at the work — and a later fail
      // never undid it (D-E4-8).
      const progress = await get(`${ME}/programs/${programId}/progress`, learnerToken);
      expect(progress.json().progress).toEqual([]);
    });

    it("refuses a learner who is not enrolled", async () => {
      const { programId, chapterId } = await ready("Not enrolled");
      const res = await post(`${ME}/assignment-submissions`, outsiderToken, {
        program_id: programId,
        chapter_id: chapterId,
        submission_text: "I am not in this course",
      });
      // V2 checked neither enrolment nor publication, so any signed-in user could
      // post rows into any business's grading queue (D-E4-5).
      expect(res.statusCode).toBe(404);
    });

    it("refuses a chapter that is not in the named programme", async () => {
      const a = await ready("Pair check A");
      const b = await ready("Pair check B");
      const res = await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: a.programId,
        chapter_id: b.chapterId,
        submission_text: "mismatched pair",
      });
      expect(res.statusCode).toBe(404);
    });

    it("refuses a chapter with no assignment brief", async () => {
      const { programId, otherChapterId } = await ready("No brief");
      const res = await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: otherChapterId,
        submission_text: "nothing was asked for",
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuses a submission with neither text nor file", async () => {
      const { programId, chapterId } = await ready("Empty submission");
      const res = await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuses a javascript: file_url", async () => {
      const { programId, chapterId } = await ready("Bad url");
      const res = await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        // z.string().url() accepts this; webUrl() does not, and the value is
        // rendered into an anchor href.
        file_url: "javascript:alert(1)",
        file_name: "x.pdf",
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuses a second submission while the first is awaiting review", async () => {
      const { programId, chapterId } = await ready("No double submit");
      const body = { program_id: programId, chapter_id: chapterId, submission_text: "essay" };
      expect((await post(`${ME}/assignment-submissions`, learnerToken, body)).statusCode).toBe(201);
      // V2 always INSERTed with no unique key, so the queue grew one row per
      // retry and nothing linked a revision to what it revised (D-E4-2).
      const again = await post(`${ME}/assignment-submissions`, learnerToken, body);
      expect(again.statusCode).toBe(409);
    });

    it("allows exactly one resubmission per needs_revision, numbered", async () => {
      const { programId, chapterId } = await ready("Resubmit");
      const body = { program_id: programId, chapter_id: chapterId, submission_text: "v1" };
      const first = await post(`${ME}/assignment-submissions`, learnerToken, body);
      const submissionId = first.json().submission.id;

      const graded = await post(
        `${BIZ}/programs/${programId}/submissions/${submissionId}/grade`,
        bizA.token,
        { status: "needs_revision", feedback: "Please add your evidence and resubmit." },
      );
      expect(graded.statusCode).toBe(200);

      const second = await post(`${ME}/assignment-submissions`, learnerToken, {
        ...body,
        submission_text: "v2",
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().submission.attempt_number).toBe(2);

      const third = await post(`${ME}/assignment-submissions`, learnerToken, body);
      expect(third.statusCode).toBe(409);
    });

    it("lists the learner's own submissions without the reviewer's identity", async () => {
      const { programId, chapterId } = await ready("Own list");
      const created = await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        submission_text: "essay",
      });
      await post(
        `${BIZ}/programs/${programId}/submissions/${created.json().submission.id}/grade`,
        bizA.token,
        { status: "passed", feedback: "Good work." },
      );
      const res = await get(`${ME}/programs/${programId}/assignment-submissions`, learnerToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].status).toBe("passed");
      expect(res.json().data[0]).not.toHaveProperty("reviewer_id");
    });
  });

  // ── Grading ───────────────────────────────────────────────────────────────

  describe("grading", () => {
    async function submitted(title: string) {
      const { programId, chapterIds } = await newProgram(bizA, title);
      await put(`${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`, bizA.token, {
        attachments: { assignment: ASSIGNMENT },
      });
      await enrol(bizA, programId, learnerId);
      const created = await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterIds[0],
        submission_text: "essay",
      });
      return {
        programId,
        chapterId: chapterIds[0],
        submissionId: created.json().submission.id as number,
      };
    }

    it("records the reviewer from the caller, never the body", async () => {
      const { programId, submissionId } = await submitted("Reviewer id");
      const res = await post(
        `${BIZ}/programs/${programId}/submissions/${submissionId}/grade`,
        bizA.token,
        { status: "passed" },
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().submission.reviewer_id).toBe(bizA.ownerId);
      expect(res.json().submission.reviewed_at).not.toBeNull();
    });

    it("completes the lesson on a pass", async () => {
      const { programId, chapterId, submissionId } = await submitted("Pass completes");
      await post(`${BIZ}/programs/${programId}/submissions/${submissionId}/grade`, bizA.token, {
        status: "passed",
      });
      const progress = await get(`${ME}/programs/${programId}/progress`, learnerToken);
      const row = progress
        .json()
        .progress.find((p: { chapter_id: number }) => p.chapter_id === chapterId);
      expect(row.status).toBe("completed");
    });

    it("reverts a completion when the work is failed", async () => {
      const { programId, chapterId, submissionId } = await submitted("Fail reverts");
      await post(`${BIZ}/programs/${programId}/submissions/${submissionId}/grade`, bizA.token, {
        status: "passed",
      });
      await post(`${BIZ}/programs/${programId}/submissions/${submissionId}/grade`, bizA.token, {
        status: "failed",
        feedback: "On review this does not meet the brief.",
      });
      // V2 completed on a pass and never reverted, so a failed assignment left
      // the lesson green and counting toward completion (D-E4-9).
      const progress = await get(`${ME}/programs/${programId}/progress`, learnerToken);
      const row = progress
        .json()
        .progress.find((p: { chapter_id: number }) => p.chapter_id === chapterId);
      expect(row.status).toBe("in_progress");
      expect(row.completed_at).toBeNull();
    });

    it("refuses to fail work without feedback", async () => {
      const { programId, submissionId } = await submitted("Fail needs reason");
      // V1 enforced 10 characters client-side; V2 ported the route and not the
      // rule, so a learner could be failed with feedback: null.
      for (const body of [
        { status: "failed" },
        { status: "failed", feedback: null },
        { status: "needs_revision", feedback: "too short" },
      ]) {
        const res = await post(
          `${BIZ}/programs/${programId}/submissions/${submissionId}/grade`,
          bizA.token,
          body,
        );
        expect(res.statusCode).toBe(400);
      }
    });

    it("passes without feedback, which needs no justification", async () => {
      const { programId, submissionId } = await submitted("Pass no reason");
      const res = await post(
        `${BIZ}/programs/${programId}/submissions/${submissionId}/grade`,
        bizA.token,
        { status: "passed" },
      );
      expect(res.statusCode).toBe(200);
    });

    it("rejects `submitted` as a grade outcome", async () => {
      const { programId, submissionId } = await submitted("No un-grading");
      const res = await post(
        `${BIZ}/programs/${programId}/submissions/${submissionId}/grade`,
        bizA.token,
        { status: "submitted" },
      );
      expect(res.statusCode).toBe(400);
    });

    it("paginates the queue and joins the learner's name", async () => {
      const { programId } = await submitted("Queue");
      const res = await get(`${BIZ}/programs/${programId}/submissions?limit=10`, bizA.token);
      expect(res.statusCode).toBe(200);
      // V2's queue had no LIMIT at all.
      expect(res.json().meta.limit).toBe(10);
      expect(res.json().data[0].first_name).toBe("Lms");
      expect(res.json().data[0].chapter_title).toBe("Lesson one");
    });

    it("filters the queue by status", async () => {
      const { programId, submissionId } = await submitted("Queue filter");
      await post(`${BIZ}/programs/${programId}/submissions/${submissionId}/grade`, bizA.token, {
        status: "passed",
      });
      const pending = await get(
        `${BIZ}/programs/${programId}/submissions?status=submitted`,
        bizA.token,
      );
      expect(pending.json().data).toHaveLength(0);
      const passed = await get(
        `${BIZ}/programs/${programId}/submissions?status=passed`,
        bizA.token,
      );
      expect(passed.json().data).toHaveLength(1);
    });
  });

  // ── Chapter quiz ──────────────────────────────────────────────────────────

  describe("chapter quiz", () => {
    async function quizReady(title: string) {
      const { programId, chapterIds } = await newProgram(bizA, title);
      await put(`${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`, bizA.token, {
        attachments: { quiz: QUIZ },
      });
      await enrol(bizA, programId, learnerId);
      return { programId, chapterId: chapterIds[0] };
    }

    it("grades server-side and ignores any client-supplied score", async () => {
      const { programId, chapterId } = await quizReady("Server graded");
      const res = await post(`${ME}/quiz-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        answers: ONE_CORRECT,
        // V2 accepted `score` and `passed` in the body and wrote them verbatim,
        // which is a learner marking their own work (D-E4-4). Here `.strict()`
        // makes the attempt a 400 rather than a silent override.
        score: 100,
        passed: true,
      });
      expect(res.statusCode).toBe(400);

      const honest = await post(`${ME}/quiz-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        answers: ONE_CORRECT,
      });
      expect(honest.statusCode).toBe(201);
      expect(honest.json()).toMatchObject({ score: 25, correct: 1, total: 4, passed: false });
    });

    it("completes the chapter on a pass and numbers attempts", async () => {
      const { programId, chapterId } = await quizReady("Quiz pass");
      const first = await post(`${ME}/quiz-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        answers: ONE_CORRECT,
      });
      expect(first.json().submission.attempt_number).toBe(1);

      const second = await post(`${ME}/quiz-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        answers: ALL_CORRECT,
      });
      expect(second.json()).toMatchObject({ score: 100, passed: true });
      expect(second.json().submission.attempt_number).toBe(2);

      const progress = await get(`${ME}/programs/${programId}/progress`, learnerToken);
      const row = progress
        .json()
        .progress.find((p: { chapter_id: number }) => p.chapter_id === chapterId);
      expect(row.status).toBe("completed");
    });

    it("lists the learner's attempts newest first", async () => {
      const { programId, chapterId } = await quizReady("Quiz list");
      await post(`${ME}/quiz-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        answers: ONE_CORRECT,
      });
      await post(`${ME}/quiz-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterId,
        answers: ALL_CORRECT,
      });
      const res = await get(`${ME}/programs/${programId}/quiz-submissions`, learnerToken);
      expect(res.json().data.map((r: { attempt_number: number }) => r.attempt_number)).toEqual([
        2, 1,
      ]);
    });

    it("refuses a quiz submission from someone not enrolled", async () => {
      const { programId, chapterId } = await quizReady("Quiz not enrolled");
      const res = await post(`${ME}/quiz-submissions`, outsiderToken, {
        program_id: programId,
        chapter_id: chapterId,
        answers: ALL_CORRECT,
      });
      expect(res.statusCode).toBe(404);
    });

    it("404s a chapter with no quiz", async () => {
      const { programId, chapterIds } = await newProgram(bizA, "No quiz here");
      await enrol(bizA, programId, learnerId);
      const res = await get(
        `${ME}/programs/${programId}/chapters/${chapterIds[0]}/quiz`,
        learnerToken,
      );
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Enrolment ─────────────────────────────────────────────────────────────

  describe("enrolment", () => {
    it("self-enrols into a published programme, idempotently", async () => {
      const { programId } = await newProgram(bizA, "Self enrol");
      const first = await post(`${ME}/enroll`, learnerToken, { program_id: programId });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ enrolled: true, already: false });
      const second = await post(`${ME}/enroll`, learnerToken, { program_id: programId });
      expect(second.json()).toEqual({ enrolled: true, already: true });
    });

    it("refuses to enrol in an unpublished programme", async () => {
      const created = await post(`${BIZ}/programs`, bizA.token, {
        title: "Draft only",
        is_published: false,
      });
      const res = await post(`${ME}/enroll`, learnerToken, {
        program_id: created.json().id,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("enrolment applications", () => {
    it("approves an application and enrols the learner in one transaction", async () => {
      const { programId } = await newProgram(bizA, "Approve");
      const applied = await post(`${ME}/enrollment-applications`, learnerToken, {
        program_id: programId,
        answers_json: { why: "Career change" },
      });
      expect(applied.statusCode).toBe(201);
      const applicationId = applied.json().application.id;

      const res = await post(
        `${BIZ}/programs/${programId}/enrollment-applications/${applicationId}/approve`,
        bizA.token,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().application.status).toBe("approved");
      expect(res.json().application.reviewed_by).toBe(bizA.ownerId);

      // V1 approved first and then inserted the enrolment with a business_id
      // column that does not exist — the insert 400'd, the caller saw a failure,
      // and the status update had already committed (D-E4-10).
      const mine = await get(`${ME}/assignments`, learnerToken);
      expect(
        mine.json().data.some((a: { program_id: number }) => a.program_id === programId),
      ).toBe(true);
    });

    it("requires a reason to reject", async () => {
      const { programId } = await newProgram(bizA, "Reject");
      const applied = await post(`${ME}/enrollment-applications`, learnerToken, {
        program_id: programId,
      });
      const applicationId = applied.json().application.id;

      const bare = await post(
        `${BIZ}/programs/${programId}/enrollment-applications/${applicationId}/reject`,
        bizA.token,
      );
      expect(bare.statusCode).toBe(400);

      const res = await post(
        `${BIZ}/programs/${programId}/enrollment-applications/${applicationId}/reject`,
        bizA.token,
        { rejection_reason: "Prerequisites not met" },
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().application.rejection_reason).toBe("Prerequisites not met");
    });

    it("refuses to decide an application twice", async () => {
      const { programId } = await newProgram(bizA, "Decide once");
      const applied = await post(`${ME}/enrollment-applications`, learnerToken, {
        program_id: programId,
      });
      const applicationId = applied.json().application.id;
      await post(
        `${BIZ}/programs/${programId}/enrollment-applications/${applicationId}/approve`,
        bizA.token,
      );
      const again = await post(
        `${BIZ}/programs/${programId}/enrollment-applications/${applicationId}/approve`,
        bizA.token,
      );
      expect(again.statusCode).toBe(409);
    });

    it("refuses a second application from the same learner", async () => {
      const { programId } = await newProgram(bizA, "One application");
      await post(`${ME}/enrollment-applications`, learnerToken, { program_id: programId });
      const again = await post(`${ME}/enrollment-applications`, learnerToken, {
        program_id: programId,
      });
      expect(again.statusCode).toBe(409);
    });

    it("counts by status with a GROUP BY, not by tallying rows in JS", async () => {
      const { programId } = await newProgram(bizA, "Counts");
      await post(`${ME}/enrollment-applications`, learnerToken, { program_id: programId });
      await post(`${ME}/enrollment-applications`, outsiderToken, { program_id: programId });
      const res = await get(
        `${BIZ}/programs/${programId}/enrollment-applications/counts`,
        bizA.token,
      );
      expect(res.json().counts).toEqual({ pending: 2, approved: 0, rejected: 0 });
    });
  });

  // ── Invitations ───────────────────────────────────────────────────────────

  describe("invitations", () => {
    it("invites in bulk and never returns the token", async () => {
      const { programId } = await newProgram(bizA, "Invite");
      const res = await post(`${BIZ}/programs/${programId}/invitations`, bizA.token, {
        emails: ["one@example.com", "two@example.com"],
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().invited).toBe(2);

      const list = await get(`${BIZ}/programs/${programId}/invitations`, bizA.token);
      expect(list.json().data).toHaveLength(2);
      // V2 shipped `invite_token` in this list to every accepted member (D-E4-7).
      for (const row of list.json().data) {
        expect(row).not.toHaveProperty("invite_token");
      }
      expect(JSON.stringify(list.json())).not.toContain("invite_token");
    });

    it("is idempotent per address instead of stacking rows", async () => {
      const { programId } = await newProgram(bizA, "Invite once");
      await post(`${BIZ}/programs/${programId}/invitations`, bizA.token, {
        emails: ["dup@example.com"],
      });
      await post(`${BIZ}/programs/${programId}/invitations`, bizA.token, {
        emails: ["dup@example.com"],
      });
      // V2 did a bare INSERT with no onConflict and had lost V1's
      // UNIQUE (program_id, email) — a self-serve email-spam amplifier (D-E4-6).
      const list = await get(`${BIZ}/programs/${programId}/invitations`, bizA.token);
      expect(list.json().data).toHaveLength(1);
    });

    it("deduplicates addresses inside one request", async () => {
      const { programId } = await newProgram(bizA, "Invite dedup");
      const res = await post(`${BIZ}/programs/${programId}/invitations`, bizA.token, {
        emails: ["same@example.com", "SAME@example.com"],
      });
      expect(res.json().invited).toBe(1);
    });

    it("links an invitation to an existing account without enrolling them", async () => {
      const { programId } = await newProgram(bizA, "Invite existing");
      const email = (await masterKnex("platform_users")
        .where({ id: learnerId })
        .first(["email"])) as { email: string };
      await post(`${BIZ}/programs/${programId}/invitations`, bizA.token, {
        emails: [email.email],
      });
      const list = await get(`${BIZ}/programs/${programId}/invitations`, bizA.token);
      expect(list.json().data[0].invitee_user_id).toBe(learnerId);

      // V1 auto-enrolled an invitee who already had an account — enrolling a
      // person on the strength of an address the inviter typed. Not carried.
      const mine = await get(`${ME}/assignments`, learnerToken);
      expect(
        mine.json().data.some((a: { program_id: number }) => a.program_id === programId),
      ).toBe(false);
    });

    it("revokes only a pending invitation", async () => {
      const { programId } = await newProgram(bizA, "Revoke");
      await post(`${BIZ}/programs/${programId}/invitations`, bizA.token, {
        emails: ["revoke@example.com"],
      });
      const list = await get(`${BIZ}/programs/${programId}/invitations`, bizA.token);
      const id = list.json().data[0].id;

      expect((await del(`${BIZ}/programs/${programId}/invitations/${id}`, bizA.token)).statusCode)
        .toBe(200);
      expect((await del(`${BIZ}/programs/${programId}/invitations/${id}`, bizA.token)).statusCode)
        .toBe(404);
    });

    it("caps a bulk request at 100 addresses, as V1 did", async () => {
      const { programId } = await newProgram(bizA, "Invite cap");
      const emails = Array.from({ length: 101 }, (_, i) => `bulk${i}@example.com`);
      const res = await post(`${BIZ}/programs/${programId}/invitations`, bizA.token, { emails });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Cross-tenant isolation ────────────────────────────────────────────────

  describe("cross-tenant isolation", () => {
    it("never lets business B read or write business A's LMS data", async () => {
      const { programId, chapterIds } = await newProgram(bizA, "Isolation");
      await put(`${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`, bizA.token, {
        attachments: { assignment: ASSIGNMENT, quiz: QUIZ },
      });
      await enrol(bizA, programId, learnerId);
      const created = await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: programId,
        chapter_id: chapterIds[0],
        submission_text: "A's learner's work",
      });
      const submissionId = created.json().submission.id;
      const applied = await post(`${ME}/enrollment-applications`, outsiderToken, {
        program_id: programId,
      });
      const applicationId = applied.json().application.id;
      await post(`${BIZ}/programs/${programId}/invitations`, bizA.token, {
        emails: ["isolate@example.com"],
      });
      const invitationId = (
        await get(`${BIZ}/programs/${programId}/invitations`, bizA.token)
      ).json().data[0].id;

      // Every read.
      for (const path of [
        `${BIZ}/programs/${programId}`,
        `${BIZ}/programs/${programId}/submissions`,
        `${BIZ}/programs/${programId}/enrollment-applications`,
        `${BIZ}/programs/${programId}/enrollment-applications/counts`,
        `${BIZ}/programs/${programId}/invitations`,
        `${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`,
      ]) {
        const res = await get(path, bizB.token);
        // Absent, not forbidden: a 403 would confirm another business's ids.
        expect(res.statusCode).toBe(404);
      }

      // Every write.
      const grade = await post(
        `${BIZ}/programs/${programId}/submissions/${submissionId}/grade`,
        bizB.token,
        { status: "passed" },
      );
      expect(grade.statusCode).toBe(404);

      const approve = await post(
        `${BIZ}/programs/${programId}/enrollment-applications/${applicationId}/approve`,
        bizB.token,
      );
      expect(approve.statusCode).toBe(404);

      const invite = await post(`${BIZ}/programs/${programId}/invitations`, bizB.token, {
        emails: ["b@example.com"],
      });
      expect(invite.statusCode).toBe(404);

      const revoke = await del(
        `${BIZ}/programs/${programId}/invitations/${invitationId}`,
        bizB.token,
      );
      expect(revoke.statusCode).toBe(404);

      const attach = await put(
        `${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`,
        bizB.token,
        { attachments: { assignment: { instruction: "B rewrote A's brief" } } },
      );
      expect(attach.statusCode).toBe(404);

      // And A's data is byte-for-byte unchanged after all of it.
      const queue = await get(`${BIZ}/programs/${programId}/submissions`, bizA.token);
      expect(queue.json().data).toHaveLength(1);
      expect(queue.json().data[0].status).toBe("submitted");
      expect(queue.json().data[0].reviewer_id).toBeNull();

      const brief = await get(
        `${BIZ}/programs/${programId}/chapters/${chapterIds[0]}/attachments`,
        bizA.token,
      );
      expect(brief.json().chapter.attachments.assignment.instruction).toBe(
        ASSIGNMENT.instruction,
      );

      const invitations = await get(`${BIZ}/programs/${programId}/invitations`, bizA.token);
      expect(invitations.json().data).toHaveLength(1);
      expect(invitations.json().data[0].email).toBe("isolate@example.com");
    });

    it("keeps A's submissions out of B's grading queue", async () => {
      const a = await newProgram(bizA, "Queue isolation A");
      await put(`${BIZ}/programs/${a.programId}/chapters/${a.chapterIds[0]}/attachments`, bizA.token, {
        attachments: { assignment: ASSIGNMENT },
      });
      await enrol(bizA, a.programId, learnerId);
      await post(`${ME}/assignment-submissions`, learnerToken, {
        program_id: a.programId,
        chapter_id: a.chapterIds[0],
        submission_text: "A only",
      });

      const b = await newProgram(bizB, "Queue isolation B");
      const queueB = await get(`${BIZ}/programs/${b.programId}/submissions`, bizB.token);
      expect(queueB.statusCode).toBe(200);
      expect(queueB.json().data).toHaveLength(0);
    });
  });
});
