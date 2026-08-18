// Scribe (Wave E3): consent-gated sessions, server-side transcript upsert,
// fail-closed transcription/AI providers, metered coaching + review through
// billing's ledger, and cross-tenant isolation.
//
// Behavioural spec: V1's scribe-consent / -token / -translate / -coaching /
// -review / -save edge functions, with each of their defects asserted as the
// CORRECT behaviour (see the D-E3-* references in the module comments).
//
// Two preconditions this suite depends on and asserts:
//   * isTranscriptionConfigured() === false — there is no speech credential in
//     this environment, and the 503 is the specified answer.
//   * isScribeAiConfigured() === false until a stub is injected — tests/setup
//     pins GEMINI_API_KEY empty so the fail-closed assertions keep their meaning.
//
// Scribe tables live in the TENANT schema, so the fixtures provision two real
// business schemas. Business B's transcripts are physically unreachable from
// business A's connection, and the isolation test proves it end to end.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const BASE = "/api/v3/business/scribe";

const CONSENT_TEXT =
  "This session will be recorded and transcribed by AI to help your counsellor " +
  "prepare your plan. You can ask us to stop at any time.";

describeDb("scribe", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let sign: (claims: Record<string, unknown>) => string;

  let setScribeAiProvider: (p: unknown) => void;
  let setTranscriptionProvider: (p: unknown) => void;
  let isScribeAiConfigured: () => boolean;
  let isTranscriptionConfigured: () => boolean;
  let promptsLib: typeof import("../../src/modules/scribe/lib/prompts.js");
  let providerLib: typeof import("../../src/modules/scribe/services/coaching.provider.js");

  interface Biz {
    id: number;
    schema: string;
    ownerId: number;
    token: string;
  }
  let bizA: Biz;
  let bizB: Biz;
  let studentId = 0;
  /** An agent seated in A who is NOT the counsellor who owns the sessions. */
  let colleagueToken = "";

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: payload ?? {} });
  const put = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "PUT", url, headers: auth(token), payload: payload ?? {} });
  const get = (url: string, token: string) =>
    app.inject({ method: "GET", url, headers: auth(token) });

  /** A stub provider returning canned JSON. Never reads the environment. */
  function stubAi(reply: string, model = "stub-model") {
    const calls: { system: string; prompt: string }[] = [];
    setScribeAiProvider({
      model,
      generate: async (opts: { system: string; prompt: string }) => {
        calls.push({ system: opts.system, prompt: opts.prompt });
        return reply;
      },
    });
    return calls;
  }

  const COACHING_JSON = JSON.stringify({
    running_summary: "Student wants a masters in Australia.",
    suggested_questions: ["Budget?", "IELTS?", "Intake?", "Fourth is trimmed"],
    flagged_concerns: ["No funding plan"],
    topics_covered: ["destination"],
    topics_remaining: ["finance", "visa"],
  });

  const REVIEW_JSON = JSON.stringify({
    full_summary: "Discussed Australian masters options.",
    action_items: [{ task: "Send IELTS booking link", owner: "counselor", deadline: "2026-09-01" }],
    course_recommendations: [{ name: "MSc IT", institution: "Uni X", reason: "fits profile" }],
    concerns: [{ concern: "Funding unclear", severity: "high" }],
  });

  async function grantCredits(businessId: number, amount: number) {
    const billing = await import("../../src/modules/billing/services/credits.service.js");
    await billing.grantCredits({
      businessId,
      amount,
      transactionType: "manual_adjustment",
      bucket: "purchased",
      idempotencyKey: `scribe-test-grant:${businessId}:${amount}:${Date.now()}:${Math.random()}`,
    });
  }

  /** Start a consented session and return its id. */
  async function startSession(biz: Biz, overrides: Record<string, unknown> = {}) {
    const res = await post(`${BASE}/sessions`, biz.token, {
      student_profile_id: studentId,
      consent: { student_name: "Asha Verbatim", consent_text: CONSENT_TEXT },
      ...overrides,
    });
    expect(res.statusCode).toBe(201);
    return res.json().session.id as number;
  }

  async function seedTranscript(biz: Biz, sessionId: number) {
    const res = await put(`${BASE}/sessions/${sessionId}/transcripts`, biz.token, {
      chunks: [
        { chunk_index: 0, speaker: "counselor", text: "What are you hoping to study?" },
        { chunk_index: 1, speaker: "student", text: "मलाई मास्टर्स गर्नु छ" },
      ],
    });
    expect(res.statusCode).toBe(200);
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
    const scribeModule = (await import("../../src/modules/scribe/index.js")).default;

    providerLib = await import("../../src/modules/scribe/services/coaching.provider.js");
    ({ setScribeAiProvider, isScribeAiConfigured } = providerLib);
    ({ setTranscriptionProvider, isTranscriptionConfigured } = await import(
      "../../src/modules/scribe/services/transcription.provider.js"
    ));
    promptsLib = await import("../../src/modules/scribe/lib/prompts.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(scribeModule);
    });
    await app.ready();

    const suffix = `${process.pid}${Date.now() % 1_000_000}`;
    sign = (claims) =>
      jwt.sign({ email: "scribe@vitest.local", ...claims }, config.JWT_SECRET);

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Scribe",
          last_name: label,
          email: uniqueEmail(`scribe.${label}`),
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
          subdomain: `scribe-${label}-${suffix}`,
          business_name: `Scribe ${label} ${suffix}`,
          business_type: label === "a" ? "agency" : "institution",
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
    studentId = await newUser("student");

    const colleagueId = await newUser("colleague");
    const tenantA = createSchemaKnex(schemaName(bizA.schema), { min: 0, max: 1 });
    try {
      const role = await tenantA("roles").first("id");
      await tenantA("agents").insert({ platform_user_id: colleagueId, role_id: role.id });
    } finally {
      await tenantA.destroy();
    }
    colleagueToken = sign({
      sub: String(colleagueId),
      type: "platform_user",
      orgId: bizA.schema,
    });

    await grantCredits(bizA.id, 500);
    await grantCredits(bizB.id, 500);
  });

  beforeEach(() => {
    // Every test starts from the unconfigured state, so a test that needs a
    // provider has to inject one and can never accidentally read a real key.
    setScribeAiProvider(null);
    setTranscriptionProvider(null);
  });

  afterAll(async () => {
    setScribeAiProvider(null);
    setTranscriptionProvider(null);
    if (masterKnex) {
      for (const biz of [bizA, bizB]) {
        if (biz?.schema) {
          await masterKnex.raw(`DROP SCHEMA IF EXISTS "${biz.schema}" CASCADE`);
        }
      }
      await masterKnex("businesses")
        .whereIn("id", [bizA?.id, bizB?.id].filter(Boolean) as number[])
        .del();
    }
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── Preconditions ─────────────────────────────────────────────────────────

  it("has no transcription credential and no AI key in this environment", () => {
    expect(isTranscriptionConfigured()).toBe(false);
    expect(isScribeAiConfigured()).toBe(false);
  });

  // These four assert the SEAM's own contract, not a route's. Mutation testing
  // found that breaking `assert*Configured()` alone changed no route response,
  // because `get*Provider()` throws the same 503 on the very next line — two
  // independent guards on one path. The route tests cannot tell them apart, so
  // each guard is pinned directly. Both must hold: a caller that checks and a
  // caller that just reaches for the provider have to fail the same way.
  describe("provider guards", () => {
    it("assertTranscriptionConfigured throws 503 when unconfigured", async () => {
      const lib = await import("../../src/modules/scribe/services/transcription.provider.js");
      expect(() => lib.assertTranscriptionConfigured()).toThrowError(
        expect.objectContaining({ statusCode: 503, code: "TRANSCRIPTION_UNAVAILABLE" }),
      );
    });

    it("getTranscriptionProvider throws 503 when unconfigured", async () => {
      const lib = await import("../../src/modules/scribe/services/transcription.provider.js");
      expect(() => lib.getTranscriptionProvider()).toThrowError(
        expect.objectContaining({ statusCode: 503 }),
      );
    });

    it("assertScribeAiConfigured throws 503 when unconfigured", () => {
      expect(() => providerLib.assertScribeAiConfigured()).toThrowError(
        expect.objectContaining({ statusCode: 503, code: "SCRIBE_AI_UNAVAILABLE" }),
      );
    });

    it("getScribeAiProvider throws 503 when unconfigured", () => {
      expect(() => providerLib.getScribeAiProvider()).toThrowError(
        expect.objectContaining({ statusCode: 503 }),
      );
    });
  });

  // ── Consent (V1 scribe-consent) ───────────────────────────────────────────

  describe("consent", () => {
    it("records the consent wording verbatim alongside the session, in one call", async () => {
      const res = await post(`${BASE}/sessions`, bizA.token, {
        student_profile_id: studentId,
        consent: {
          student_name: "Asha Verbatim",
          consent_text: CONSENT_TEXT,
          locale: "en-AU",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.session.status).toBe("active");
      expect(body.session.counselor_id).toBe(bizA.ownerId);
      // V1 stored only a name and a timestamp; the wording lived in unversioned
      // JSX, so a V1 consent row could not evidence what was agreed to.
      expect(body.consent.consent_text).toBe(CONSENT_TEXT);
      expect(body.consent.consent_version).toMatch(/^\d{4}-\d{2}-\d{2}\./);
      expect(body.consent.locale).toBe("en-AU");
      expect(body.consent.student_name).toBe("Asha Verbatim");
    });

    it("refuses a session with no consent block", async () => {
      const res = await post(`${BASE}/sessions`, bizA.token, {
        student_profile_id: studentId,
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuses a session that identifies nobody", async () => {
      const res = await post(`${BASE}/sessions`, bizA.token, {
        consent: { student_name: "Nobody", consent_text: CONSENT_TEXT },
      });
      expect(res.statusCode).toBe(400);
    });

    it("accepts a guest with no account, as V1's walk-in flow did", async () => {
      const res = await post(`${BASE}/sessions`, bizA.token, {
        guest_name: "Walk In",
        guest_phone: "+61400000000",
        consent: { student_name: "Walk In", consent_text: CONSENT_TEXT },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().session.guest_name).toBe("Walk In");
    });

    it("rejects a body that tries to supply counselor_id", async () => {
      const res = await post(`${BASE}/sessions`, bizA.token, {
        student_profile_id: studentId,
        counselor_id: 1,
        consent: { student_name: "Asha", consent_text: CONSENT_TEXT },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuses without business context", async () => {
      const noOrg = sign({ sub: String(bizA.ownerId), type: "platform_user" });
      const res = await post(`${BASE}/sessions`, noOrg, {
        student_profile_id: studentId,
        consent: { student_name: "Asha", consent_text: CONSENT_TEXT },
      });
      expect(res.statusCode).toBe(403);
    });

    it("stores the consent record so it cannot be rewritten by a profile edit", async () => {
      const { createSchemaKnex, schemaName } = await import("../../src/core/db/knex.js");
      const sessionId = await startSession(bizA, {
        consent: { student_name: "Name As Spoken", consent_text: CONSENT_TEXT },
      });
      const tenant = createSchemaKnex(schemaName(bizA.schema), { min: 0, max: 1 });
      try {
        const row = await tenant("scribe_consent_log")
          .where({ session_id: sessionId })
          .first(["student_name", "student_id", "consent_text", "user_agent"]);
        expect(row.student_name).toBe("Name As Spoken");
        expect(row.student_id).toBe(studentId);
        expect(row.consent_text).toBe(CONSENT_TEXT);
      } finally {
        await tenant.destroy();
      }
    });

    it("refuses transcription on a session whose consent row is missing", async () => {
      const { createSchemaKnex, schemaName } = await import("../../src/core/db/knex.js");
      const sessionId = await startSession(bizA);
      const tenant = createSchemaKnex(schemaName(bizA.schema), { min: 0, max: 1 });
      try {
        await tenant("scribe_consent_log").where({ session_id: sessionId }).del();
      } finally {
        await tenant.destroy();
      }
      // V1 never checked: scribe-token, -coaching, -review and -save all worked
      // on a session with no consent record at all (D-E3-1).
      const res = await put(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token, {
        chunks: [{ chunk_index: 0, speaker: "counselor", text: "hello" }],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error ?? res.json().message).toMatch(/consent/i);
    });
  });

  // ── Transcript writes ─────────────────────────────────────────────────────

  describe("transcripts", () => {
    it("writes chunks server-side and persists with no provider configured", async () => {
      const sessionId = await startSession(bizA);
      const res = await put(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token, {
        chunks: [
          { chunk_index: 0, speaker: "counselor", text: "Hello" },
          { chunk_index: 1, speaker: "student", text: "Namaste" },
        ],
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().written).toBe(2);
      expect(isScribeAiConfigured()).toBe(false);

      const list = await get(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token);
      expect(list.json().data.map((r: { text: string }) => r.text)).toEqual(["Hello", "Namaste"]);
    });

    it("upserts a resent chunk instead of duplicating it", async () => {
      const sessionId = await startSession(bizA);
      await put(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token, {
        chunks: [{ chunk_index: 0, speaker: "counselor", text: "first take" }],
      });
      // V1's browser-side counter reset to 0 on retry and the unique violation
      // silently dropped the line while the UI still showed it (D-E3-5).
      const again = await put(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token, {
        chunks: [{ chunk_index: 0, speaker: "counselor", text: "corrected take" }],
      });
      expect(again.statusCode).toBe(200);

      const list = await get(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token);
      expect(list.json().data).toHaveLength(1);
      expect(list.json().data[0].text).toBe("corrected take");
    });

    it("rejects a duplicated chunk_index inside one request", async () => {
      const sessionId = await startSession(bizA);
      const res = await put(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token, {
        chunks: [
          { chunk_index: 0, speaker: "counselor", text: "a" },
          { chunk_index: 0, speaker: "student", text: "b" },
        ],
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects an unknown speaker label", async () => {
      const sessionId = await startSession(bizA);
      const res = await put(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token, {
        chunks: [{ chunk_index: 0, speaker: "interloper", text: "a" }],
      });
      expect(res.statusCode).toBe(400);
    });

    it("404s a session belonging to another counsellor in the same business", async () => {
      const sessionId = await startSession(bizA);
      // A colleague's counselling transcript is not business-wide reading.
      const res = await get(`${BASE}/sessions/${sessionId}/transcripts`, colleagueToken);
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Session lifecycle ─────────────────────────────────────────────────────

  describe("lifecycle", () => {
    it("ends a session with the recorder's duration, not wall-clock", async () => {
      const sessionId = await startSession(bizA);
      const res = await post(`${BASE}/sessions/${sessionId}/end`, bizA.token, {
        duration_seconds: 930,
        language_detected: "ne",
      });
      expect(res.statusCode).toBe(200);
      // V1 computed now - started_at inside scribe-review, so review-screen time
      // was billed as session length (D-E3-6).
      expect(res.json().session.duration_seconds).toBe(930);
      expect(res.json().session.status).toBe("ended");
      expect(res.json().session.ended_at).not.toBeNull();
    });

    it("refuses to end an already-ended session", async () => {
      const sessionId = await startSession(bizA);
      await post(`${BASE}/sessions/${sessionId}/end`, bizA.token, {});
      const again = await post(`${BASE}/sessions/${sessionId}/end`, bizA.token, {});
      expect(again.statusCode).toBe(409);
    });

    it("lists every state, so an unreviewed session is never lost", async () => {
      const active = await startSession(bizA);
      const ended = await startSession(bizA);
      await post(`${BASE}/sessions/${ended}/end`, bizA.token, {});

      const res = await get(`${BASE}/sessions?limit=100`, bizA.token);
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.map((s: { id: number }) => s.id);
      // V1's history filtered status = 'completed' while review only ever set
      // 'completing', so an unsaved-review session vanished for ever (D-E3-10).
      expect(ids).toContain(active);
      expect(ids).toContain(ended);
    });

    it("keeps guest_phone out of the list projection", async () => {
      await startSession(bizA, {
        guest_name: "Phone Holder",
        guest_phone: "+61411111111",
        consent: { student_name: "Phone Holder", consent_text: CONSENT_TEXT },
        student_profile_id: null,
      });
      const res = await get(`${BASE}/sessions?limit=100`, bizA.token);
      for (const row of res.json().data) {
        expect(row).not.toHaveProperty("guest_phone");
      }
    });

    it("reports an honest pending-review count", async () => {
      const before = (await get(`${BASE}/stats`, bizA.token)).json().pending_review;
      const sessionId = await startSession(bizA);
      await post(`${BASE}/sessions/${sessionId}/end`, bizA.token, {});
      const after = (await get(`${BASE}/stats`, bizA.token)).json();
      expect(after.pending_review).toBe(before + 1);
    });
  });

  // ── Fail-closed provider paths ────────────────────────────────────────────

  describe("fail-closed providers", () => {
    it("503s the transcription token, with every guard already passed", async () => {
      const sessionId = await startSession(bizA);
      const res = await post(`${BASE}/sessions/${sessionId}/transcription-token`, bizA.token);
      expect(res.statusCode).toBe(503);
      expect(res.json().code ?? res.json().error).toMatch(/TRANSCRIPTION_UNAVAILABLE|503/i);
    });

    it("404s the token for another counsellor's session BEFORE reaching the provider", async () => {
      const sessionId = await startSession(bizA);
      const res = await post(
        `${BASE}/sessions/${sessionId}/transcription-token`,
        colleagueToken,
      );
      // Ownership is resolved first, so the 503 never masks an authorisation hole.
      expect(res.statusCode).toBe(404);
    });

    it("409s the token for a session that is no longer active", async () => {
      const sessionId = await startSession(bizA);
      await post(`${BASE}/sessions/${sessionId}/end`, bizA.token, {});
      // V1 minted a fresh OpenAI key for a session in ANY state (D-E3-16).
      const res = await post(`${BASE}/sessions/${sessionId}/transcription-token`, bizA.token);
      expect(res.statusCode).toBe(409);
    });

    it("mints a token once a provider is injected", async () => {
      const sessionId = await startSession(bizA);
      setTranscriptionProvider({
        model: "stub-transcribe",
        mintEphemeralToken: async () => ({
          token: "ek_stub",
          expires_at: 1_800_000_000,
          model: "stub-transcribe",
        }),
      });
      const res = await post(`${BASE}/sessions/${sessionId}/transcription-token`, bizA.token);
      expect(res.statusCode).toBe(200);
      // V1's frontend discarded expires_at and then could not refresh.
      expect(res.json()).toMatchObject({ token: "ek_stub", expires_at: 1_800_000_000 });
    });

    it("503s coaching, and the transcript survives untouched", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);

      const res = await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);
      expect(res.statusCode).toBe(503);

      const list = await get(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token);
      expect(list.json().data).toHaveLength(2);
    });

    it("503s coaching without charging a credit", async () => {
      const billing = await import("../../src/modules/billing/services/credits.service.js");
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);

      const before = (await billing.getBalance(bizA.id)).balance;
      expect((await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token)).statusCode).toBe(
        503,
      );
      expect((await billing.getBalance(bizA.id)).balance).toBe(before);
    });

    it("503s the review", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      await post(`${BASE}/sessions/${sessionId}/end`, bizA.token, {});
      const res = await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      expect(res.statusCode).toBe(503);
    });

    it("503s translation", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      const res = await post(
        `${BASE}/sessions/${sessionId}/transcripts/1/translate`,
        bizA.token,
      );
      expect(res.statusCode).toBe(503);
    });

    it("refuses coaching with no transcript before asking for a provider", async () => {
      const sessionId = await startSession(bizA);
      const res = await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Coaching (V1 scribe-coaching) ─────────────────────────────────────────

  describe("coaching", () => {
    it("reads the transcript from the database, not from the request body", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      const calls = stubAi(COACHING_JSON);

      const res = await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token, {
        transcript_lines: [{ speaker: "student", text: "FABRICATED LINE", translation: null }],
      });
      expect(res.statusCode).toBe(201);
      // V1 took transcript_lines from the body and never read scribe_transcripts,
      // so a counsellor could be coached on speech that never happened (D-E3-11).
      expect(calls[0].prompt).toContain("What are you hoping to study?");
      expect(calls[0].prompt).not.toContain("FABRICATED LINE");
    });

    it("persists topics_covered, which V1 declared and never wrote", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi(COACHING_JSON);

      const res = await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);
      expect(res.statusCode).toBe(201);
      // D-E3-17: the column existed, the client type required it, nothing wrote it.
      expect(res.json().snapshot.topics_covered).toEqual(["destination"]);
      expect(res.json().snapshot.suggested_questions).toHaveLength(3);
    });

    it("charges exactly one credit per persisted snapshot", async () => {
      const billing = await import("../../src/modules/billing/services/credits.service.js");
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi(COACHING_JSON);

      const before = (await billing.getBalance(bizA.id)).balance;
      await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);
      expect((await billing.getBalance(bizA.id)).balance).toBe(before - 1);
    });

    it("uses the existing ai_deduct ledger rather than a second one", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi(COACHING_JSON);
      await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);

      const row = await masterKnex("credit_transactions")
        .where({ reference_type: "scribe_session", reference_id: String(sessionId) })
        .first(["transaction_type", "amount", "idempotency_key"]);
      expect(row.transaction_type).toBe("ai_deduct");
      expect(Number(row.amount)).toBe(-1);
      expect(row.idempotency_key).toMatch(/^scribe:/);
    });

    it("502s a response that will not parse, and charges nothing for it", async () => {
      const billing = await import("../../src/modules/billing/services/credits.service.js");
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi("I am afraid I cannot do that.");

      const before = (await billing.getBalance(bizA.id)).balance;
      const res = await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);
      // V1 served a hard-coded "Analyzing session..." object AND charged for it,
      // indistinguishable from a real result (D-E3-3).
      expect(res.statusCode).toBe(502);
      expect((await billing.getBalance(bizA.id)).balance).toBe(before);
    });

    it("accepts a fenced JSON response, which V1's review path could not", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi("```json\n" + COACHING_JSON + "\n```");
      const res = await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);
      expect(res.statusCode).toBe(201);
    });

    it("refuses when the wallet cannot cover it, before the provider is reached", async () => {
      const billing = await import("../../src/modules/billing/services/credits.service.js");
      const poor = await (async () => {
        const [row] = await masterKnex("platform_users")
          .insert({
            first_name: "Scribe",
            last_name: "Poor",
            email: uniqueEmail("scribe.poor"),
            account_status: 1,
          })
          .returning(["id"]);
        const [biz] = await masterKnex("businesses")
          .insert({
            owner_id: row.id,
            subdomain: `scribe-poor-${process.pid}${Date.now() % 1_000_000}`,
            business_name: `Scribe Poor ${Date.now()}`,
            business_type: "agency",
            account_status: 1,
            status: "active",
          })
          .returning(["id", "schema_name"]);
        const { provisionBusinessSchema } = await import(
          "../../src/core/business/provisioner.js"
        );
        await provisionBusinessSchema(biz.schema_name);
        return {
          id: biz.id as number,
          schema: biz.schema_name as string,
          ownerId: row.id as number,
          token: sign({ sub: String(row.id), type: "platform_user", orgId: biz.schema_name }),
        };
      })();

      try {
        expect((await billing.getBalance(poor.id)).balance).toBe(0);
        const sessionId = await startSession(poor);
        await seedTranscript(poor, sessionId);

        let providerCalled = false;
        setScribeAiProvider({
          model: "stub",
          generate: async () => {
            providerCalled = true;
            return COACHING_JSON;
          },
        });

        const res = await post(`${BASE}/sessions/${sessionId}/coaching`, poor.token);
        // V1 read the balance, called the paid gateway anyway, and skipped the
        // debit when the pool was empty — free spend on a 60-second timer
        // (D-E3-12).
        expect(res.statusCode).toBe(402);
        expect(providerCalled).toBe(false);
      } finally {
        await masterKnex.raw(`DROP SCHEMA IF EXISTS "${poor.schema}" CASCADE`);
        await masterKnex("businesses").where({ id: poor.id }).del();
      }
    });

    it("branches the system prompt on business type, as V1 did", async () => {
      const sessionA = await startSession(bizA);
      await seedTranscript(bizA, sessionA);
      const callsA = stubAi(COACHING_JSON);
      await post(`${BASE}/sessions/${sessionA}/coaching`, bizA.token);

      const sessionB = await startSession(bizB);
      await seedTranscript(bizB, sessionB);
      const callsB = stubAi(COACHING_JSON);
      await post(`${BASE}/sessions/${sessionB}/coaching`, bizB.token);

      expect(callsA[0].system).not.toBe(callsB[0].system);
      expect(callsA[0].system).toMatch(/agent/i);
      expect(callsB[0].system).toMatch(/institution/i);
    });

    it("lists snapshots newest first", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi(COACHING_JSON);
      await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);
      await post(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);

      const res = await get(`${BASE}/sessions/${sessionId}/coaching`, bizA.token);
      expect(res.json().data).toHaveLength(2);
    });
  });

  // ── Review (V1 scribe-review + scribe-save) ───────────────────────────────

  describe("review", () => {
    async function endedSessionWithTranscript(biz: Biz) {
      const sessionId = await startSession(biz);
      await seedTranscript(biz, sessionId);
      await post(`${BASE}/sessions/${sessionId}/end`, biz.token, { duration_seconds: 600 });
      return sessionId;
    }

    it("refuses to review a session that is still recording", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi(REVIEW_JSON);
      const res = await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      expect(res.statusCode).toBe(409);
    });

    it("generates a review and stores the validated shape", async () => {
      const sessionId = await endedSessionWithTranscript(bizA);
      stubAi(REVIEW_JSON);
      const res = await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      expect(res.statusCode).toBe(200);
      expect(res.json().generated).toBe(true);
      expect(res.json().review.action_items[0]).toMatchObject({
        task: "Send IELTS booking link",
        owner: "counselor",
      });
      expect(res.json().review.saved_at).toBeNull();
    });

    it("is idempotent: a second call returns the stored review and charges nothing", async () => {
      const billing = await import("../../src/modules/billing/services/credits.service.js");
      const sessionId = await endedSessionWithTranscript(bizA);
      const calls = stubAi(REVIEW_JSON);

      const first = await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      expect(first.json().generated).toBe(true);
      const after = (await billing.getBalance(bizA.id)).balance;

      const second = await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      // V1 hit UNIQUE(session_id) and answered 500 "Failed to generate review"
      // for a session that had a good one — after paying again (D-E3-14).
      expect(second.statusCode).toBe(200);
      expect(second.json().generated).toBe(false);
      expect(second.json().review.id).toBe(first.json().review.id);
      expect(calls).toHaveLength(1);
      expect((await billing.getBalance(bizA.id)).balance).toBe(after);
    });

    it("charges for the review, which V1 gave away for free", async () => {
      const billing = await import("../../src/modules/billing/services/credits.service.js");
      const sessionId = await endedSessionWithTranscript(bizA);
      stubAi(REVIEW_JSON);
      const before = (await billing.getBalance(bizA.id)).balance;
      await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      // D-E3-2: the most expensive call in the feature was unmetered.
      expect((await billing.getBalance(bizA.id)).balance).toBe(before - 1);
    });

    it("rejects a model concern with no severity instead of storing it", async () => {
      const sessionId = await endedSessionWithTranscript(bizA);
      stubAi(
        JSON.stringify({
          full_summary: "x",
          action_items: [],
          course_recommendations: [],
          concerns: [{ concern: "no severity given", severity: null }],
        }),
      );
      // V1 wrote these as unvalidated unknown[]; a null severity then threw in
      // the renderer (D-E3-7).
      const res = await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      expect(res.statusCode).toBe(400);
    });

    it("saves the counsellor's edit, sets saved_at and moves the session to reviewed", async () => {
      const sessionId = await endedSessionWithTranscript(bizA);
      stubAi(REVIEW_JSON);
      await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);

      const res = await put(`${BASE}/sessions/${sessionId}/review`, bizA.token, {
        counselor_notes: "Follow up in a fortnight.",
        full_summary: "Counsellor-approved summary.",
        concerns: [{ concern: "Funding", severity: "medium" }],
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().review.saved_at).not.toBeNull();
      expect(res.json().review.counselor_notes).toBe("Follow up in a fortnight.");
      expect(res.json().session.status).toBe("reviewed");
    });

    it("404s a save with no generated review instead of reporting success", async () => {
      const sessionId = await endedSessionWithTranscript(bizA);
      // V1 returned {"success": true} unconditionally, so a wrong review id saved
      // nothing, still marked the session complete, and reported success
      // (D-E3-15).
      const res = await put(`${BASE}/sessions/${sessionId}/review`, bizA.token, {
        counselor_notes: "nothing to attach to",
      });
      expect(res.statusCode).toBe(404);

      const session = await get(`${BASE}/sessions/${sessionId}`, bizA.token);
      expect(session.json().session.status).toBe("ended");
    });

    it("rejects an unvalidated action item", async () => {
      const sessionId = await endedSessionWithTranscript(bizA);
      stubAi(REVIEW_JSON);
      await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      const res = await put(`${BASE}/sessions/${sessionId}/review`, bizA.token, {
        action_items: [{ task: "do it", owner: "the-cat" }],
      });
      expect(res.statusCode).toBe(400);
    });

    it("freezes the transcript once the session is reviewed", async () => {
      const sessionId = await endedSessionWithTranscript(bizA);
      stubAi(REVIEW_JSON);
      await post(`${BASE}/sessions/${sessionId}/review`, bizA.token);
      await put(`${BASE}/sessions/${sessionId}/review`, bizA.token, { counselor_notes: "done" });

      const res = await put(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token, {
        chunks: [{ chunk_index: 9, speaker: "counselor", text: "added after sign-off" }],
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ── Translation (V1 scribe-translate) ─────────────────────────────────────

  describe("translation", () => {
    it("translates a session-scoped chunk and persists it server-side", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      const calls = stubAi("I want to do a masters");

      const res = await post(
        `${BASE}/sessions/${sessionId}/transcripts/1/translate`,
        bizA.token,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().chunk.translation).toBe("I want to do a masters");
      // The transcript text is fenced and labelled as data (D-E3-9).
      expect(calls[0].prompt).toContain("--- TEXT START ---");

      // V1 had the BROWSER write this column under RLS, so it silently no-oped
      // whenever the row was not visible (D-E3-19).
      const list = await get(`${BASE}/sessions/${sessionId}/transcripts`, bizA.token);
      const chunk = list.json().data.find((r: { chunk_index: number }) => r.chunk_index === 1);
      expect(chunk.translation).toBe("I want to do a masters");
    });

    it("skips ASCII-only text without charging, as V1 short-circuited", async () => {
      const billing = await import("../../src/modules/billing/services/credits.service.js");
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi("never called");

      const before = (await billing.getBalance(bizA.id)).balance;
      const res = await post(
        `${BASE}/sessions/${sessionId}/transcripts/0/translate`,
        bizA.token,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().translated).toBe(false);
      expect((await billing.getBalance(bizA.id)).balance).toBe(before);
    });

    it("404s a chunk that is not in this session", async () => {
      const sessionId = await startSession(bizA);
      await seedTranscript(bizA, sessionId);
      stubAi("x");
      const res = await post(
        `${BASE}/sessions/${sessionId}/transcripts/99/translate`,
        bizA.token,
      );
      expect(res.statusCode).toBe(404);
    });

    it("has no session-free translate endpoint at all", async () => {
      // V1's scribe-translate took {text} and nothing else: no session, no
      // business, no ownership, no credit — an open Gemini proxy for any
      // authenticated account on the platform (D-E3-18).
      stubAi("x");
      const res = await post(`${BASE}/translate`, bizA.token, { text: "मलाई" });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Cross-tenant isolation ────────────────────────────────────────────────

  describe("cross-tenant isolation", () => {
    it("never lets business B reach business A's session, transcript or review", async () => {
      const sessionA = await startSession(bizA);
      await seedTranscript(bizA, sessionA);
      await post(`${BASE}/sessions/${sessionA}/end`, bizA.token, {});
      stubAi(REVIEW_JSON);
      await post(`${BASE}/sessions/${sessionA}/review`, bizA.token);

      for (const path of [
        `${BASE}/sessions/${sessionA}`,
        `${BASE}/sessions/${sessionA}/transcripts`,
        `${BASE}/sessions/${sessionA}/coaching`,
      ]) {
        const res = await get(path, bizB.token);
        expect(res.statusCode).toBe(404);
      }

      for (const path of [
        `${BASE}/sessions/${sessionA}/end`,
        `${BASE}/sessions/${sessionA}/review`,
        `${BASE}/sessions/${sessionA}/coaching`,
        `${BASE}/sessions/${sessionA}/transcription-token`,
      ]) {
        const res = await post(path, bizB.token);
        expect(res.statusCode).toBe(404);
      }

      const write = await put(`${BASE}/sessions/${sessionA}/transcripts`, bizB.token, {
        chunks: [{ chunk_index: 0, speaker: "counselor", text: "injected by B" }],
      });
      expect(write.statusCode).toBe(404);

      const save = await put(`${BASE}/sessions/${sessionA}/review`, bizB.token, {
        counselor_notes: "B tampering",
      });
      expect(save.statusCode).toBe(404);

      // And A's own content is unchanged after all of that.
      const list = await get(`${BASE}/sessions/${sessionA}/transcripts`, bizA.token);
      expect(list.json().data).toHaveLength(2);
      expect(
        list.json().data.some((r: { text: string }) => r.text === "injected by B"),
      ).toBe(false);
    });

    it("keeps A's sessions out of B's list and B's stats", async () => {
      await startSession(bizA);
      const listB = await get(`${BASE}/sessions?limit=100`, bizB.token);
      const statsA = await get(`${BASE}/stats`, bizA.token);
      const statsB = await get(`${BASE}/stats`, bizB.token);
      // Different tenant schemas: B's counsellor id could even collide with A's
      // and still see nothing, because the rows are not in B's schema.
      for (const row of listB.json().data) {
        expect(row.counselor_id).toBe(bizB.ownerId);
      }
      expect(statsA.json().total).toBeGreaterThan(0);
      expect(statsB.json().total).not.toBe(statsA.json().total);
    });
  });

  // ── Pure helpers ──────────────────────────────────────────────────────────

  describe("prompt assembly", () => {
    it("prefers the translation over the source text, as V1 did", () => {
      const rendered = promptsLib.renderTranscript([
        { speaker: "student", text: "मलाई", translation: "I want" },
        { speaker: "counselor", text: "Sure", translation: null },
      ]);
      expect(rendered).toBe("STUDENT: I want\nCOUNSELOR: Sure");
    });

    it("caps the transcript, keeping the recent tail", () => {
      const lines = Array.from({ length: 5000 }, (_, i) => ({
        speaker: "student",
        text: `line ${i} ${"x".repeat(50)}`,
        translation: null,
      }));
      const rendered = promptsLib.renderTranscript(lines);
      // V1 re-sent the whole transcript every 60 seconds, unbounded.
      expect(rendered.length).toBeLessThanOrEqual(60_000);
      expect(rendered).toContain("line 4999");
    });

    it("only translates non-ASCII text", () => {
      expect(promptsLib.needsTranslation("kasto chha")).toBe(false);
      expect(promptsLib.needsTranslation("मलाई")).toBe(true);
    });

    it("strips both fence styles", () => {
      expect(providerLib.stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
      expect(providerLib.stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
      expect(providerLib.stripCodeFence('{"a":1}')).toBe('{"a":1}');
    });
  });
});
