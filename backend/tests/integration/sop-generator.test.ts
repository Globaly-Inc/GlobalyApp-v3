// SOP generator (E5) — questionnaire → draft → revision → export.
//
// Every assertion here is derived from V1's three edge functions (sop-intake,
// sop-generate, sop-documents) or from a defect they carry, never from the V3
// implementation:
//
//  * V1's `resolveAIProvider()` threw before it touched the database, and the outer
//    catch answered **500** with the raw internal message
//    ("Neither LOVABLE_API_KEY nor GEMINI_API_KEY is configured"). §1.6 says an
//    unconfigured AI path is a 503. Here: 503, the questionnaire still durable, the
//    session honestly `pending_provider`, and nothing charged.
//  * V1 metered `stage1_draft` and `improve_section` but reached
//    `handleStage2Refine` / `handleQualityCheck` *before* resolving a wallet at all,
//    so two of its four paid model calls were free and unlimited. Here the 402
//    pre-flight is unconditional and is asserted with a working provider injected,
//    so it cannot be passing for the wrong reason.
//  * V1's scribe-coaching sibling returned a hard-coded "Analyzing session..."
//    object AND charged for it. A provider that fails or returns nothing is a 502
//    with no document and no charge.
//  * V1 had no uniqueness on `(session, document_type, version)` and none on the
//    current row, so two rows could both be is_current.
//  * V1's `save_version` capped history at 10 and pruned the oldest non-v1 row.
//
// The provider is injected. Nothing here reads GEMINI_API_KEY, and
// tests/setup/db-url.ts pins it empty so the 503 assertions keep their meaning.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

type ProviderModule = typeof import("../../src/modules/sop/services/sop-ai.provider.js");
type SopAiProvider = NonNullable<Parameters<ProviderModule["setSopAiProvider"]>[0]>;

const DRAFT = `My decision to read for a Master of Data Science at the named faculty grew out of
three years building reporting pipelines at a regional insurer, where I saw how badly a
mis-specified model costs a claims team. `.repeat(6);

const STUB_USAGE = { promptTokens: 1_500, completionTokens: 2_500 };
/**
 * AU is one of V1's dual-document destinations: sop_config seeds both a
 * `university_sop` and a `visa_sop` for it, so one generate call produces two drafts
 * and the turn's tokens are the sum. creditsFor(3000, 5000) with
 * TOKENS_PER_CREDIT = 1000 → ceil(8000/1000).
 */
const DOCS_PER_AU_SESSION = 2;
const EXPECTED_CREDITS = 8;

interface StubOptions {
  fail?: boolean;
  emptyText?: boolean;
}

function makeProvider(opts: StubOptions = {}) {
  const calls: string[] = [];
  const provider: SopAiProvider = {
    model: "gemini-3.5-flash",
    async generate({ system }) {
      calls.push(system);
      if (opts.fail) throw new Error("upstream model refused the request");
      return { text: opts.emptyText ? "   " : DRAFT, usage: { ...STUB_USAGE } };
    },
  };
  return { provider, calls };
}

describeDb("sop generator", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let providerModule: ProviderModule;

  let studentA = 0;
  let studentB = 0;
  let walletA = 0;
  let walletB = 0;
  let tokenA = "";
  let tokenB = "";
  let countryAU = 0;

  const createdUserIds: number[] = [];
  const START_CREDITS = 100;

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });
    providerModule = await import("../../src/modules/sop/services/sop-ai.provider.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import(
      "../../src/core/plugins/request-context.plugin.js"
    );
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const sopModule = (await import("../../src/modules/sop/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (secured) => {
      await secured.register(authPlugin);
      await secured.register(sopModule);
    });
    await app.ready();

    const insertUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Sop",
          last_name: label,
          email: uniqueEmail(`sop.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      createdUserIds.push(Number(row.id));
      return Number(row.id);
    };
    studentA = await insertUser("student-a");
    studentB = await insertUser("student-b");

    const insertWallet = async (userId: number, credits: number) => {
      const [row] = await masterKnex("credit_wallets")
        .insert({ owner_type: "user", platform_user_id: userId, free_balance: credits })
        .returning(["id"]);
      return Number(row.id);
    };
    walletA = await insertWallet(studentA, START_CREDITS);
    walletB = await insertWallet(studentB, 0);

    const au = await masterKnex("countries").select("id").where({ iso2: "AU" }).first();
    countryAU = Number(au!.id);

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "sop@vitest.local", ...claims }, config.JWT_SECRET as string);
    tokenA = sign({ sub: String(studentA), type: "platform_user" });
    tokenB = sign({ sub: String(studentB), type: "platform_user" });
  });

  afterAll(async () => {
    providerModule?.setSopAiProvider(null);
    await app?.close();
    if (masterKnex) {
      // Sessions, answers, documents, logs, wallets and ledger rows all cascade
      // from the platform_user, so removing the users removes everything written.
      await masterKnex("platform_users").whereIn("id", createdUserIds).del();
    }
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  beforeEach(async () => {
    providerModule.setSopAiProvider(null);
    await masterKnex("credit_wallets").where({ id: walletA }).update({ free_balance: START_CREDITS });
    await masterKnex("credit_wallets").where({ id: walletB }).update({ free_balance: 0 });
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const req = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: auth(token),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  const P = "/api/v3/personal/sop";

  async function newSession(token = tokenA) {
    const res = await req("POST", `${P}/sessions`, token, {
      country_id: countryAU,
      target_org_type: "institution",
      target_org_id: 1,
      profile_snapshot: { headline: "BSc Statistics, 2 years analytics" },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: number; status: string };
  }

  async function answerAll(sessionId: number, token = tokenA) {
    const res = await req("PUT", `${P}/sessions/${sessionId}/answers`, token, {
      answers: [
        { question_key: "why_this_course", answer: "The applied forecasting stream." },
        { question_key: "career_plan", answer: "Return home to lead a claims analytics team." },
        { question_key: "home_ties", answer: "Family business and a mortgage in Pune." },
      ],
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  const generate = (sessionId: number, token = tokenA) =>
    req("POST", `${P}/sessions/${sessionId}/generate`, token);

  const walletTotal = async (walletId: number) => {
    const row = await masterKnex("credit_wallets").where({ id: walletId }).first();
    return Number(row.free_balance) + Number(row.subscription_balance) + Number(row.purchased_balance);
  };

  const logsFor = (sessionId: number) =>
    masterKnex("sop_generation_logs").where({ session_id: sessionId }).orderBy("id");

  /** Scoped to one document type: an AU session carries two independent histories. */
  const docsFor = (sessionId: number, documentType = "university_sop") =>
    masterKnex("sop_documents")
      .where({ session_id: sessionId, document_type: documentType })
      .orderBy("version");

  const allDocsFor = (sessionId: number) =>
    masterKnex("sop_documents").where({ session_id: sessionId }).orderBy(["document_type", "version"]);

  const usageFor = (userId: number) =>
    masterKnex("ai_usage_events").where({ platform_user_id: userId }).orderBy("id");

  // ── the questionnaire ──────────────────────────────────────────────────────

  describe("intake", () => {
    it("opens a session owned by the caller and snapshots their profile", async () => {
      const session = await newSession();
      const row = await masterKnex("sop_intake_sessions").where({ id: session.id }).first();
      expect(Number(row.student_id)).toBe(studentA);
      expect(Number(row.initiated_by)).toBe(studentA);
      expect(row.is_agent_initiated).toBe(false);
      expect(row.status).toBe("in_progress");
      expect(row.profile_snapshot).toEqual({ headline: "BSc Statistics, 2 years analytics" });
    });

    it("upserts answers on the (session, question_key) key rather than duplicating", async () => {
      const session = await newSession();
      await answerAll(session.id);
      const again = await req("PUT", `${P}/sessions/${session.id}/answers`, tokenA, {
        answers: [{ question_key: "career_plan", answer: "Revised: lead pricing, not claims." }],
      });
      expect(again.statusCode).toBe(200);

      const rows = await masterKnex("sop_conversation_answers")
        .where({ session_id: session.id })
        .orderBy("question_key");
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.question_key === "career_plan")!.answer).toBe(
        "Revised: lead pricing, not claims.",
      );
    });

    it("moves the session to ready_to_generate once every required answer is present", async () => {
      const session = await newSession();
      await answerAll(session.id);
      const row = await masterKnex("sop_intake_sessions").where({ id: session.id }).first();
      expect(row.status).toBe("ready_to_generate");
      expect(row.stage).toBe("zone_b");
    });

    it("never lets one student read another's session", async () => {
      const session = await newSession(tokenA);
      const res = await req("GET", `${P}/sessions/${session.id}`, tokenB);
      expect(res.statusCode).toBe(404);
    });

    it("omits the profile snapshot and chat history from the list response", async () => {
      await newSession();
      const res = await req("GET", `${P}/sessions`, tokenA);
      expect(res.statusCode).toBe(200);
      const { data } = res.json() as { data: Array<Record<string, unknown>> };
      expect(data.length).toBeGreaterThan(0);
      for (const row of data) {
        expect(row).not.toHaveProperty("profile_snapshot");
        expect(row).not.toHaveProperty("chat_history");
      }
    });
  });

  // ── edge cases the guards exist for ────────────────────────────────────────

  describe("guards", () => {
    it("opens a session with nothing but a snapshot, leaving every reference null", async () => {
      const res = await req("POST", `${P}/sessions`, tokenA, {});
      expect(res.statusCode).toBe(201);
      const body = res.json() as Record<string, unknown>;
      expect(body.country_id).toBeNull();
      expect(body.target_org_type).toBeNull();
      expect(body.target_org_id).toBeNull();
      expect(body.course_service_id).toBeNull();
      const row = await masterKnex("sop_intake_sessions").where({ id: body.id as number }).first();
      expect(row.profile_snapshot).toEqual({});
    });

    it("refuses to draft before the questionnaire is complete", async () => {
      const session = await newSession();
      await req("PUT", `${P}/sessions/${session.id}/answers`, tokenA, {
        answers: [{ question_key: "why_this_course", answer: "Only one of three." }],
      });
      providerModule.setSopAiProvider(makeProvider().provider);
      const res = await generate(session.id);
      expect(res.statusCode).toBe(400);
      expect(await allDocsFor(session.id)).toHaveLength(0);
    });

    it("refuses a destination sop_config has no template for, rather than inventing one", async () => {
      const created = await req("POST", `${P}/sessions`, tokenA, { profile_snapshot: {} });
      const sessionId = (created.json() as { id: number }).id;
      await answerAll(sessionId);
      providerModule.setSopAiProvider(makeProvider().provider);
      const res = await generate(sessionId);
      expect(res.statusCode).toBe(409);
      expect(await allDocsFor(sessionId)).toHaveLength(0);
    });

    it("stores a structured answer alongside a prose one", async () => {
      const session = await newSession();
      const res = await req("PUT", `${P}/sessions/${session.id}/answers`, tokenA, {
        answers: [
          { question_key: "test_scores", answer_json: { ielts: 7.5 } },
          { question_key: "why_this_course", answer: "Applied forecasting." },
        ],
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ready: boolean; answers: Array<Record<string, unknown>> };
      expect(body.ready).toBe(false);
      expect(body.answers.find((a) => a.question_key === "test_scores")!.answer_json).toEqual({
        ielts: 7.5,
      });
    });

    it("returns the session detail with its answers and current drafts", async () => {
      const session = await newSession();
      await answerAll(session.id);
      providerModule.setSopAiProvider(makeProvider().provider);
      await generate(session.id);

      const res = await req("GET", `${P}/sessions/${session.id}`, tokenA);
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        status: string;
        profile_snapshot: Record<string, unknown>;
        answers: unknown[];
        documents: Array<{ content: string }>;
      };
      expect(body.status).toBe("generated");
      expect(body.profile_snapshot).toEqual({ headline: "BSc Statistics, 2 years analytics" });
      expect(body.answers).toHaveLength(3);
      expect(body.documents).toHaveLength(DOCS_PER_AU_SESSION);
      expect(body.documents[0].content).toContain("Master of Data Science");
    });

    it("serves one version in full to its owner and to nobody else", async () => {
      const session = await newSession();
      await answerAll(session.id);
      providerModule.setSopAiProvider(makeProvider().provider);
      const gen = await generate(session.id);
      const docId = (gen.json() as { documents: Array<{ id: number }> }).documents[0].id;

      const mine = await req("GET", `${P}/documents/${docId}`, tokenA);
      expect(mine.statusCode).toBe(200);
      expect((mine.json() as { content: string }).content).toContain("Master of Data Science");

      const theirs = await req("GET", `${P}/documents/${docId}`, tokenB);
      expect(theirs.statusCode).toBe(404);
    });

    it("404s a restore of a version that was never written", async () => {
      const session = await newSession();
      await answerAll(session.id);
      providerModule.setSopAiProvider(makeProvider().provider);
      const gen = await generate(session.id);
      const docId = (gen.json() as { documents: Array<{ id: number }> }).documents[0].id;

      const res = await req("POST", `${P}/documents/${docId}/restore`, tokenA, { version: 99 });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── destination reference data ─────────────────────────────────────────────

  describe("config", () => {
    it("serves the destination's document types and limits", async () => {
      const res = await req("GET", `${P}/config?country_code=AU`, tokenA);
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        document_types: string[];
        config: Array<{ document_type: string; min_words: number; banned_phrases: string[] }>;
        guide: { donts: string[] } | null;
      };
      // V1 seeded AU with both a university SOP and a visa SOP.
      expect(body.document_types.sort()).toEqual(["university_sop", "visa_sop"]);
      const uni = body.config.find((c) => c.document_type === "university_sop")!;
      expect(uni.min_words).toBe(500);
      expect(uni.banned_phrases).toContain("since a young age");
      expect(body.guide!.donts.join(" ")).toContain("stay permanently");
    });

    it("answers an unseeded destination with no document types rather than inventing one", async () => {
      const res = await req("GET", `${P}/config?country_code=ZZ`, tokenA);
      expect(res.statusCode).toBe(200);
      expect((res.json() as { document_types: string[] }).document_types).toEqual([]);
    });
  });

  // ── fail closed ────────────────────────────────────────────────────────────

  describe("generation, unconfigured provider", () => {
    it("503s with the questionnaire durable, the session pending, and nothing charged", async () => {
      const session = await newSession();
      await answerAll(session.id);
      const before = await walletTotal(walletA);
      // Earlier blocks settled turns for studentA, so every metering assertion in this
      // suite is a DELTA. "Nothing charged" means no new usage event and no new debit.
      const usageBefore = (await usageFor(studentA)).length;

      // No provider injected, and GEMINI_API_KEY is pinned empty by testEnv().
      expect(providerModule.isSopAiConfigured()).toBe(false);

      const res = await generate(session.id);
      expect(res.statusCode).toBe(503);
      expect((res.json() as { code: string }).code).toBe("SOP_AI_UNAVAILABLE");
      // The raw provider-config message must never reach the client (V1 leaked it).
      expect(res.body).not.toContain("GEMINI_API_KEY");

      // Database work happened BEFORE the provider was reached.
      const row = await masterKnex("sop_intake_sessions").where({ id: session.id }).first();
      expect(row.status).toBe("pending_provider");
      const answers = await masterKnex("sop_conversation_answers").where({ session_id: session.id });
      expect(answers).toHaveLength(3);

      const logs = await logsFor(session.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("failed");
      expect(Number(logs[0].credits_charged)).toBe(0);

      expect(await allDocsFor(session.id)).toHaveLength(0);
      expect(await walletTotal(walletA)).toBe(before);
      expect(await usageFor(studentA)).toHaveLength(usageBefore);
    });
  });

  // ── metering ───────────────────────────────────────────────────────────────

  describe("metering", () => {
    it("402s an empty wallet BEFORE the provider is called", async () => {
      const session = await newSession(tokenB);
      await answerAll(session.id, tokenB);

      // A perfectly usable provider is installed on purpose: the 402 must come from
      // the pre-flight gate, not from an absent provider.
      const { provider, calls } = makeProvider();
      providerModule.setSopAiProvider(provider);

      const res = await generate(session.id, tokenB);
      expect(res.statusCode).toBe(402);
      expect(calls).toHaveLength(0);
      expect(await allDocsFor(session.id)).toHaveLength(0);
      expect(await usageFor(studentB)).toHaveLength(0);
      // Refused before any side effect at all — not even an attempt log.
      expect(await logsFor(session.id)).toHaveLength(0);
    });

    it("charges once, through the shared ledger, for a draft it actually produced", async () => {
      const session = await newSession();
      await answerAll(session.id);
      const before = await walletTotal(walletA);
      const usageBefore = (await usageFor(studentA)).length;
      const { provider, calls } = makeProvider();
      providerModule.setSopAiProvider(provider);

      const res = await generate(session.id);
      expect(res.statusCode).toBe(201);
      // V1's DUAL_DOC_COUNTRIES: AU needs a university SOP and a visa SOP, and the
      // seeded sop_config rows — not a hard-coded country set — are what say so.
      expect(calls).toHaveLength(DOCS_PER_AU_SESSION);
      // The prompt is grounded in the destination guide and the answers.
      expect(calls[0]).toContain("Genuine Temporary Entrant");
      expect(calls[0]).toContain("claims analytics team");

      const all = await allDocsFor(session.id);
      expect(all.map((d) => d.document_type)).toEqual(["university_sop", "visa_sop"]);

      const docs = await docsFor(session.id);
      expect(docs).toHaveLength(1);
      expect(docs[0].version).toBe(1);
      expect(docs[0].is_current).toBe(true);
      expect(docs[0].content).toContain("Master of Data Science");
      expect(Number(docs[0].word_count)).toBeGreaterThan(0);

      expect(await walletTotal(walletA)).toBe(before - EXPECTED_CREDITS);

      // Exactly ONE new usage event for a turn that produced two documents: the SOP
      // draft is one metered turn, not one per document.
      const usage = await usageFor(studentA);
      expect(usage).toHaveLength(usageBefore + 1);
      expect(Number(usage.at(-1)!.credits_charged)).toBe(EXPECTED_CREDITS);
      expect(usage.at(-1)!.outcome).toBe("complete");

      const logs = await logsFor(session.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("success");
      expect(Number(logs[0].credits_charged)).toBe(EXPECTED_CREDITS);
    });

    it("returns the existing draft on a second call, charging nothing", async () => {
      const session = await newSession();
      await answerAll(session.id);
      const { provider, calls } = makeProvider();
      providerModule.setSopAiProvider(provider);

      expect((await generate(session.id)).statusCode).toBe(201);
      const after = await walletTotal(walletA);

      const second = await generate(session.id);
      expect(second.statusCode).toBe(200);
      expect((second.json() as { generated: boolean }).generated).toBe(false);
      expect(calls).toHaveLength(DOCS_PER_AU_SESSION);
      expect(await walletTotal(walletA)).toBe(after);
      expect(await allDocsFor(session.id)).toHaveLength(DOCS_PER_AU_SESSION);
    });
  });

  // ── a provider failure is never a draft ────────────────────────────────────

  describe("generation, failing provider", () => {
    it("502s and charges nothing when the model call throws", async () => {
      const session = await newSession();
      await answerAll(session.id);
      const before = await walletTotal(walletA);
      // studentA has settled turns from the metering block above, so the assertion is
      // "no NEW usage event", not "none at all".
      const usageBefore = (await usageFor(studentA)).length;
      providerModule.setSopAiProvider(makeProvider({ fail: true }).provider);

      const res = await generate(session.id);
      expect(res.statusCode).toBe(502);
      expect(await allDocsFor(session.id)).toHaveLength(0);
      expect(await walletTotal(walletA)).toBe(before);
      expect(await usageFor(studentA)).toHaveLength(usageBefore);

      const row = await masterKnex("sop_intake_sessions").where({ id: session.id }).first();
      expect(row.status).toBe("failed");
      const logs = await logsFor(session.id);
      expect(logs.at(-1)!.status).toBe("failed");
      expect(Number(logs.at(-1)!.credits_charged)).toBe(0);
    });

    it("502s rather than persisting an empty draft", async () => {
      const session = await newSession();
      await answerAll(session.id);
      const before = await walletTotal(walletA);
      providerModule.setSopAiProvider(makeProvider({ emptyText: true }).provider);

      const res = await generate(session.id);
      expect(res.statusCode).toBe(502);
      expect(await allDocsFor(session.id)).toHaveLength(0);
      expect(await walletTotal(walletA)).toBe(before);
    });
  });

  // ── revision history ───────────────────────────────────────────────────────

  describe("revisions", () => {
    async function drafted() {
      const session = await newSession();
      await answerAll(session.id);
      providerModule.setSopAiProvider(makeProvider().provider);
      const res = await generate(session.id);
      const body = res.json() as { documents: Array<{ id: number; document_type: string }> };
      const uni = body.documents.find((d) => d.document_type === "university_sop")!;
      return { session, documentId: uni.id };
    }

    it("saves an edit as a new version and moves is_current to it", async () => {
      const { session, documentId } = await drafted();
      const edited = `${DRAFT}\n\nAdded by the student: a paragraph about the mortgage in Pune.`;
      const res = await req("POST", `${P}/documents/${documentId}/versions`, tokenA, {
        content: edited,
      });
      expect(res.statusCode).toBe(201);
      expect((res.json() as { version: number }).version).toBe(2);

      const docs = await docsFor(session.id);
      expect(docs.map((d) => d.version)).toEqual([1, 2]);
      expect(docs.map((d) => d.is_current)).toEqual([false, true]);
      // Edit depth is measured against version 1, which V1 stored as a duplicate
      // `content_v1` column on every row; here it is read from version 1 itself.
      expect(Number(docs[1].edit_depth_pct)).toBeGreaterThan(0);
      expect(Number(docs[0].edit_depth_pct)).toBe(0);
    });

    it("keeps at most ten versions, pruning the oldest edit and never version 1", async () => {
      const { session, documentId } = await drafted();
      for (let i = 2; i <= 13; i += 1) {
        const res = await req("POST", `${P}/documents/${documentId}/versions`, tokenA, {
          content: `${DRAFT} revision ${i}`,
        });
        expect(res.statusCode).toBe(201);
      }
      const docs = await docsFor(session.id);
      expect(docs).toHaveLength(10);
      expect(docs[0].version).toBe(1);
      expect(docs.at(-1)!.version).toBe(13);
      expect(docs.filter((d) => d.is_current)).toHaveLength(1);
    });

    it("restores an old version as a NEW version, never overwriting history", async () => {
      const { session, documentId } = await drafted();
      await req("POST", `${P}/documents/${documentId}/versions`, tokenA, {
        content: `${DRAFT} an edit I regret`,
      });
      const res = await req("POST", `${P}/documents/${documentId}/restore`, tokenA, { version: 1 });
      expect(res.statusCode).toBe(201);
      expect((res.json() as { version: number }).version).toBe(3);

      const docs = await docsFor(session.id);
      expect(docs.map((d) => d.version)).toEqual([1, 2, 3]);
      expect(docs[2].content).toBe(docs[0].content);
      expect(docs[2].is_current).toBe(true);
    });

    it("lists the history without handing back the text of every version", async () => {
      const { documentId } = await drafted();
      await req("POST", `${P}/documents/${documentId}/versions`, tokenA, { content: `${DRAFT} v2` });
      const res = await req("GET", `${P}/documents/${documentId}/versions`, tokenA);
      expect(res.statusCode).toBe(200);
      const { data } = res.json() as { data: Array<Record<string, unknown>> };
      expect(data).toHaveLength(2);
      for (const row of data) {
        expect(row).not.toHaveProperty("content");
        expect(row).toHaveProperty("word_count");
      }
    });

    it("refuses a revision on someone else's document", async () => {
      const { documentId } = await drafted();
      const res = await req("POST", `${P}/documents/${documentId}/versions`, tokenB, {
        content: "not mine",
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── export ─────────────────────────────────────────────────────────────────

  describe("export", () => {
    async function drafted() {
      const session = await newSession();
      await answerAll(session.id);
      providerModule.setSopAiProvider(makeProvider().provider);
      const res = await generate(session.id);
      const body = res.json() as { documents: Array<{ id: number; document_type: string }> };
      return body.documents.find((d) => d.document_type === "university_sop")!.id;
    }

    it("serves the current draft as plain text with a download filename", async () => {
      const documentId = await drafted();
      const res = await req("GET", `${P}/documents/${documentId}/export?format=text`, tokenA);
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
      expect(String(res.headers["content-disposition"])).toContain("attachment");
      expect(res.body).toContain("Master of Data Science");
    });

    it("serves markdown with the destination and document type in the front matter", async () => {
      const documentId = await drafted();
      const res = await req("GET", `${P}/documents/${documentId}/export?format=markdown`, tokenA);
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/markdown");
      expect(res.body).toContain("# Statement of Purpose");
      expect(res.body).toContain("University Sop");
    });

    it("rejects a format it cannot actually produce instead of pretending", async () => {
      const documentId = await drafted();
      const res = await req("GET", `${P}/documents/${documentId}/export?format=pdf`, tokenA);
      expect(res.statusCode).toBe(400);
    });

    it("logs the export against the session", async () => {
      const documentId = await drafted();
      await req("GET", `${P}/documents/${documentId}/export?format=text`, tokenA);
      const doc = await masterKnex("sop_documents").where({ id: documentId }).first();
      const logs = await logsFor(Number(doc.session_id));
      expect(logs.map((l) => l.action)).toContain("export_text");
    });

    it("never exports another student's SOP", async () => {
      const documentId = await drafted();
      const res = await req("GET", `${P}/documents/${documentId}/export?format=text`, tokenB);
      expect(res.statusCode).toBe(404);
    });
  });
});
