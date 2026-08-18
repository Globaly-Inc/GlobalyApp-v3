// E1 — the 12 admin content endpoints the frontend console calls, plus the three
// retrieval/embedding endpoints, through Fastify inject against real Postgres.
//
// These were on scripts/api-contract-allowlist.json until this wave even though the
// handlers existed, because check-api-contract.mjs reads the route table statically
// and they were registered from a loop variable. They had no tests either, so this
// suite is the first thing that has ever exercised them end to end.
//
// The load-bearing cases: the elevated role bar (super_admin | data_admin only), that
// every write is attributed to the right admin_users row, and that POST /reembed 503s
// with no provider instead of reporting a dispatch that cannot happen.

import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";
import { STUB_MODEL } from "../helpers/knowledge-fixtures.js";

/** LAVINMQ_URL points at a dead port in tests; capture publishes instead. */
const published: Array<{ queue: string; message: unknown }> = [];
vi.mock("../../src/shared/queue/queueService.js", () => ({
  queueService: {
    publish: async (queue: string, message: unknown) => {
      published.push({ queue, message });
    },
    consume: async () => {},
  },
}));

const describeDb = describe.skipIf(!dbAvailable);

const BASE = "/api/v3/admin/ai-knowledge";

describeDb("ai-knowledge admin endpoints", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: { GEMINI_API_KEY?: string; GEMINI_EMBEDDING_MODEL: string };

  let superAdminToken = "";
  let dataAdminToken = "";
  let moderatorToken = "";
  let platformUserToken = "";
  let adminUserId = 0;
  let adminPlatformUserId = 0;
  let plainUserId = 0;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token = superAdminToken) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, payload: unknown = {}, token = superAdminToken) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: payload as object });
  const patch = (url: string, payload: unknown = {}, token = superAdminToken) =>
    app.inject({ method: "PATCH", url, headers: auth(token), payload: payload as object });
  const del = (url: string, token = superAdminToken) => app.inject({ method: "DELETE", url, headers: auth(token) });

  const RUN = `e1-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ config } = await import("../../src/config.js"));
    const sign = (claims: Record<string, unknown>) =>
      jwt.sign(claims, config.JWT_SECRET, { expiresIn: "1h" });

    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));

    delete config.GEMINI_API_KEY;
    config.GEMINI_EMBEDDING_MODEL = STUB_MODEL;

    const Fastify = (await import("fastify")).default;
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const aiKnowledgeModule = (await import("../../src/modules/superadmin/ai-knowledge/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      scoped.register(aiKnowledgeModule, { prefix: BASE });
    });
    await app.ready();

    const [adminUser] = await masterKnex("platform_users")
      .insert({ first_name: "E1", last_name: "Admin", email: uniqueEmail("e1admin"), account_status: 1 })
      .returning("id");
    adminPlatformUserId = Number(adminUser.id);

    const [plainUser] = await masterKnex("platform_users")
      .insert({ first_name: "E1", last_name: "Plain", email: uniqueEmail("e1plain"), account_status: 1 })
      .returning("id");
    plainUserId = Number(plainUser.id);

    const [adminRow] = await masterKnex("superadmin.admin_users")
      .insert({ platform_user_id: adminPlatformUserId, role: "super_admin" })
      .returning("id");
    adminUserId = Number(adminRow.id);

    superAdminToken = sign({ sub: String(adminPlatformUserId), type: "admin", role: "super_admin", email: "sa@test.local" });
    dataAdminToken = sign({ sub: String(adminPlatformUserId), type: "admin", role: "data_admin", email: "da@test.local" });
    moderatorToken = sign({ sub: String(adminPlatformUserId), type: "admin", role: "moderator", email: "mod@test.local" });
    platformUserToken = sign({ sub: String(plainUserId), type: "platform_user", email: "pu@test.local" });
  });

  afterAll(async () => {
    if (masterKnex) {
      await masterKnex("superadmin.admin_audit_logs").where({ admin_id: adminUserId }).del();
      await masterKnex("superadmin.ai_knowledge_visa").whereILike("visa_type", `${RUN}%`).del();
      await masterKnex("superadmin.ai_knowledge_faqs").whereILike("question", `${RUN}%`).del();
      await masterKnex("superadmin.ai_knowledge_country_guides").whereILike("country", `${RUN}%`).del();
      await masterKnex("superadmin.admin_users").where({ id: adminUserId }).del();
      await masterKnex("platform_users").whereIn("id", [adminPlatformUserId, plainUserId]).del();
    }
    if (shutdownPools) await shutdownPools();
  });

  // ── The role bar ──

  it("rejects a platform user and a moderator, accepts both elevated admin roles", async () => {
    expect((await get(`${BASE}/overview`, platformUserToken)).statusCode).toBe(403);
    expect((await get(`${BASE}/overview`, moderatorToken)).statusCode).toBe(403);
    expect((await get(`${BASE}/overview`, superAdminToken)).statusCode).toBe(200);
    expect((await get(`${BASE}/overview`, dataAdminToken)).statusCode).toBe(200);
  });

  it("rejects an unauthenticated request", async () => {
    expect((await app.inject({ method: "GET", url: `${BASE}/overview` })).statusCode).toBe(401);
  });

  it("refuses a write from a token whose account has no admin record", async () => {
    // The role claim alone is not enough: writes are audited against a real
    // superadmin.admin_users row, and a token that names none must not write.
    const jwt = (await import("jsonwebtoken")).default;
    const orphan = jwt.sign(
      { sub: String(plainUserId), type: "admin", role: "super_admin", email: "ghost@test.local" },
      config.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const res = await post(`${BASE}/faqs`, { question: `${RUN} ghost`, answer: "no" }, orphan);
    expect(res.statusCode).toBe(403);
    // Reads are unaffected — only the audited writes need the mapping.
    expect((await get(`${BASE}/overview`, orphan)).statusCode).toBe(200);
  });

  // ── The 12 content endpoints ──

  const cases = [
    {
      name: "visa",
      path: "/visa",
      key: "visa",
      listKey: "visa",
      create: { destination_country: "Australia", visa_type: `${RUN} subclass 500`, processing_time_days: 42 },
      patchBody: { processing_time_days: 55 },
      assertPatched: (row: Record<string, unknown>) => expect(row.processing_time_days).toBe(55),
    },
    {
      name: "faqs",
      path: "/faqs",
      key: "faq",
      listKey: "faqs",
      create: { question: `${RUN} how many hours can I work?`, answer: "48 per fortnight." },
      patchBody: { answer: "48 hours per fortnight while in session." },
      assertPatched: (row: Record<string, unknown>) =>
        expect(row.answer).toBe("48 hours per fortnight while in session."),
    },
    {
      name: "country-guides",
      path: "/country-guides",
      key: "guide",
      listKey: "guides",
      create: { country: `${RUN}-Australia`, education_system: "Three-year bachelor degrees." },
      patchBody: { climate: "Temperate in the south." },
      assertPatched: (row: Record<string, unknown>) => expect(row.climate).toBe("Temperate in the south."),
    },
  ] as const;

  for (const c of cases) {
    describe(`${c.name} CRUD`, () => {
      it("creates, lists, patches and deletes", async () => {
        const created = await post(`${BASE}${c.path}`, c.create);
        expect(created.statusCode).toBe(201);
        const row = created.json()[c.key];
        expect(row.id).toBeTruthy();

        const listed = await get(`${BASE}${c.path}`);
        expect(listed.statusCode).toBe(200);
        expect(listed.json()[c.listKey].some((r: { id: string }) => r.id === row.id)).toBe(true);

        const patched = await patch(`${BASE}${c.path}/${row.id}`, c.patchBody);
        expect(patched.statusCode).toBe(200);
        c.assertPatched(patched.json()[c.key]);

        const removed = await del(`${BASE}${c.path}/${row.id}`);
        expect(removed.statusCode).toBe(200);
        expect(removed.json()).toEqual({ deleted: true });

        const after = await get(`${BASE}${c.path}`);
        expect(after.json()[c.listKey].some((r: { id: string }) => r.id === row.id)).toBe(false);
      });

      it("404s on a patch or delete of an id that is gone", async () => {
        const missing = "00000000-0000-4000-8000-000000000000";
        expect((await patch(`${BASE}${c.path}/${missing}`, c.patchBody)).statusCode).toBe(404);
        expect((await del(`${BASE}${c.path}/${missing}`)).statusCode).toBe(404);
      });

      it("400s on a malformed id", async () => {
        expect((await patch(`${BASE}${c.path}/not-a-uuid`, c.patchBody)).statusCode).toBe(400);
      });
    });
  }

  it("attributes every write to the admin_users row, not the platform user id", async () => {
    // admin_audit_logs.admin_id has an FK to admin_users.id while JWT.sub is the
    // platform_user_id; passing sub straight through would either 500 or misattribute.
    const created = await post(`${BASE}/faqs`, { question: `${RUN} audit check`, answer: "yes" });
    expect(created.statusCode).toBe(201);

    const entry = await masterKnex("superadmin.admin_audit_logs")
      .where({ action: "AI_KNOWLEDGE_FAQS_CREATE", entity_id: created.json().faq.id })
      .first("admin_id");
    expect(Number(entry.admin_id)).toBe(adminUserId);
    expect(Number(entry.admin_id)).not.toBe(adminPlatformUserId);

    await del(`${BASE}/faqs/${created.json().faq.id}`);
  });

  it("filters the list by ?q= and ?active=", async () => {
    const created = await post(`${BASE}/faqs`, { question: `${RUN} searchable needle`, answer: "found" });
    const id = created.json().faq.id;
    try {
      const hit = await get(`${BASE}/faqs?q=searchable%20needle`);
      expect(hit.json().faqs.some((r: { id: string }) => r.id === id)).toBe(true);

      const miss = await get(`${BASE}/faqs?q=${RUN}-nothing-matches-this`);
      expect(miss.json().faqs).toHaveLength(0);

      await patch(`${BASE}/faqs/${id}`, { active: false });
      const activeOnly = await get(`${BASE}/faqs?active=true`);
      expect(activeOnly.json().faqs.some((r: { id: string }) => r.id === id)).toBe(false);
    } finally {
      await del(`${BASE}/faqs/${id}`);
    }
  });

  it("rejects an invalid create payload with 400", async () => {
    expect((await post(`${BASE}/faqs`, { question: "" })).statusCode).toBe(400);
    expect((await post(`${BASE}/visa`, {})).statusCode).toBe(400);
  });

  // ── Retrieval + embedding endpoints ──

  it("GET /embedding-status reports the pending backlog and the model", async () => {
    const res = await get(`${BASE}/embedding-status`);
    expect(res.statusCode).toBe(200);
    const { embedding } = res.json();
    expect(embedding.provider_configured).toBe(false);
    expect(embedding.model).toBe(STUB_MODEL);
    expect(typeof embedding.chunks_awaiting).toBe("number");
    expect(embedding.documents_awaiting).toBe(embedding.documents_total - embedding.documents_embedded);
  });

  it("GET /search answers text-only and says it is degraded", async () => {
    const res = await get(`${BASE}/search?q=student%20visa%20work%20hours`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.retrieval.degraded).toBe(true);
    expect(body.retrieval.degraded_reason).toBe("embedding_unavailable");
    expect(body.retrieval.vector_leg).toBe(false);
    expect(body.retrieval.text_leg).toBe(true);
  });

  it("GET /search validates its query", async () => {
    expect((await get(`${BASE}/search`)).statusCode).toBe(400);
    expect((await get(`${BASE}/search?q=a`)).statusCode).toBe(400);
    expect((await get(`${BASE}/search?q=visa&legs=telepathy`)).statusCode).toBe(400);
    expect((await get(`${BASE}/search?q=visa&limit=999`)).statusCode).toBe(400);
  });

  it("POST /reembed 503s with no provider instead of reporting a dispatch", async () => {
    const res = await post(`${BASE}/reembed`, {});
    expect(res.statusCode).toBe(503);
    expect(res.json().error?.code ?? res.json().code).toBe("EMBEDDING_UNAVAILABLE");
    // Nothing was queued and nothing was audited, because nothing happened.
    const audited = await masterKnex("superadmin.admin_audit_logs")
      .where({ action: "AI_KNOWLEDGE_EMBED_REQUEST", admin_id: adminUserId })
      .count("* as c")
      .first();
    expect(Number(audited?.c ?? 0)).toBe(0);
    expect(published).toHaveLength(0);
  });

  it("POST /reembed 404s for a document that does not exist, before it checks the provider", async () => {
    const res = await post(`${BASE}/reembed`, { document_id: "00000000-0000-4000-8000-000000000000" });
    expect(res.statusCode).toBe(404);
  });

  it("POST /reembed validates its payload", async () => {
    expect((await post(`${BASE}/reembed`, { document_id: "nope" })).statusCode).toBe(400);
    expect((await post(`${BASE}/reembed`, { limit: 0 })).statusCode).toBe(400);
  });

  it("POST /reembed queues a sweep and audits it once a provider is configured", async () => {
    published.length = 0;
    config.GEMINI_API_KEY = "test-key";
    try {
      const res = await post(`${BASE}/reembed`, { limit: 25 });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toMatchObject({ dispatched: true, model: STUB_MODEL });
      expect(typeof res.json().documents_awaiting).toBe("number");

      expect(published).toHaveLength(1);
      expect(published[0].queue).toBe("ai_knowledge_embed");
      expect(published[0].message).toEqual({ documentId: undefined, limit: 25 });

      const audited = await masterKnex("superadmin.admin_audit_logs")
        .where({ action: "AI_KNOWLEDGE_EMBED_REQUEST", admin_id: adminUserId })
        .first("details");
      expect(audited).toBeTruthy();
    } finally {
      delete config.GEMINI_API_KEY;
      published.length = 0;
    }
  });

  // ── Verification queue ──

  it("lists, approves and rejects verification-queue items", async () => {
    const [item] = await masterKnex("superadmin.data_verification_queue")
      .insert({
        submitted_by: adminPlatformUserId,
        submitter_type: "admin",
        data_type: "visa",
        data_id: "00000000-0000-4000-8000-000000000001",
        status: "pending",
      })
      .returning("id");
    const [second] = await masterKnex("superadmin.data_verification_queue")
      .insert({
        submitted_by: adminPlatformUserId,
        submitter_type: "admin",
        data_type: "faq",
        data_id: "00000000-0000-4000-8000-000000000002",
        status: "pending",
      })
      .returning("id");

    try {
      const listed = await get(`${BASE}/verification-queue?status=pending`);
      expect(listed.statusCode).toBe(200);
      expect(listed.json().queue.some((r: { id: string }) => r.id === item.id)).toBe(true);

      const approved = await post(`${BASE}/verification-queue/${item.id}/approve`);
      expect(approved.statusCode).toBe(200);
      expect(approved.json().item.status).toBe("verified");

      const rejected = await post(`${BASE}/verification-queue/${second.id}/reject`, {
        rejection_reason: "Source is not official",
      });
      expect(rejected.statusCode).toBe(200);
      expect(rejected.json().item.status).toBe("rejected");
      expect(rejected.json().item.rejection_reason).toBe("Source is not official");

      expect((await post(`${BASE}/verification-queue/${second.id}/reject`, {})).statusCode).toBe(400);
    } finally {
      await masterKnex("superadmin.data_verification_queue").whereIn("id", [item.id, second.id]).del();
    }
  });

  it("GET /overview returns the four stat-card counts", async () => {
    const res = await get(`${BASE}/overview`);
    expect(res.statusCode).toBe(200);
    const { counts } = res.json();
    for (const key of ["visa", "faqs", "guides", "pending_reviews"]) {
      expect(typeof counts[key]).toBe("number");
    }
  });
});
