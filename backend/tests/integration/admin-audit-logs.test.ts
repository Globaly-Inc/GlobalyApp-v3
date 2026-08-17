// Admin audit-log viewer — GET /api/v3/admin/audit-logs (+ /:id).
// Reads the two audit tables that actually exist: superadmin.admin_audit_logs
// (admin actions) and public.audit_logs (platform-wide actions).
// Real Postgres, Fastify inject, no live server.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("admin audit logs", () => {
  let app: FastifyInstance;
  let masterKnex: import("knex").Knex;
  let sign: (claims: Record<string, unknown>) => string;

  let superAdminToken: string;
  let dataAdminToken: string;
  let moderatorToken: string;
  let platformUserToken: string;

  // Fixture identity — rebuilt in beforeAll so a wiped DB self-heals.
  let actorAdminId: number;
  let actorUserId: number;
  let otherUserId: number;
  const RUN = `c4-${process.pid}-${Date.now()}`;
  const ADMIN_ACTION = `${RUN}_ADMIN_ACTION`;
  const PLATFORM_ACTION = `${RUN}_PLATFORM_ACTION`;

  /** Every fixture row shares this entity_type so the suite can isolate its own data. */
  const ENTITY_TYPE = `${RUN}_entity`;

  const ADMIN_ROWS = 7;
  const PLATFORM_ROWS = 5;
  const TOTAL_ROWS = ADMIN_ROWS + PLATFORM_ROWS;

  async function makeUser(prefix: string): Promise<number> {
    const [row] = await masterKnex("platform_users")
      .insert({
        first_name: prefix,
        last_name: "Fixture",
        email: uniqueEmail(prefix),
        account_status: 1,
      })
      .returning("id");
    return Number(row.id);
  }

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { config } = await import("../../src/config.js");
    sign = (claims) => jwt.sign(claims, config.JWT_SECRET, { expiresIn: "1h" });

    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));

    const Fastify = (await import("fastify")).default;
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { requireAdmin } = await import("../../src/core/plugins/auth.plugin.js");
    const auditLogsModule = (await import("../../src/modules/superadmin/audit-logs/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      scoped.register(async (guarded) => {
        guarded.addHook("onRequest", requireAdmin);
        guarded.register(auditLogsModule, { prefix: "/api/v3/admin/audit-logs" });
      });
    });
    await app.ready();

    // ── fixtures ──
    actorUserId = await makeUser("c4actor");
    otherUserId = await makeUser("c4other");
    const [adminRow] = await masterKnex("superadmin.admin_users")
      .insert({ platform_user_id: actorUserId, role: "super_admin" })
      .returning("id");
    actorAdminId = Number(adminRow.id);

    // Deterministic, strictly-descending timestamps so ordering assertions are stable.
    const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();

    await masterKnex("superadmin.admin_audit_logs").insert(
      Array.from({ length: ADMIN_ROWS }, (_, i) => ({
        admin_id: actorAdminId,
        action: ADMIN_ACTION,
        entity_type: ENTITY_TYPE,
        entity_id: null,
        details: JSON.stringify({ seq: i }),
        created_at: at(i),
      })),
    );

    await masterKnex("audit_logs").insert(
      Array.from({ length: PLATFORM_ROWS }, (_, i) => ({
        platform_user_id: i === 0 ? otherUserId : actorUserId,
        action: PLATFORM_ACTION,
        entity_type: ENTITY_TYPE,
        entity_id: `e-${i}`,
        details: JSON.stringify({ seq: i }),
        ip_address: "203.0.113.7",
        created_at: at(100 + i),
      })),
    );

    superAdminToken = sign({ sub: String(actorUserId), type: "admin", role: "super_admin", email: "sa@test.local" });
    dataAdminToken = sign({ sub: String(actorUserId), type: "admin", role: "data_admin", email: "da@test.local" });
    moderatorToken = sign({ sub: String(actorUserId), type: "admin", role: "moderator", email: "mod@test.local" });
    platformUserToken = sign({ sub: String(otherUserId), type: "platform_user", email: "pu@test.local" });
  });

  afterAll(async () => {
    const userIds = [actorUserId, otherUserId].filter((id) => id !== undefined);
    if (masterKnex) {
      await masterKnex("superadmin.admin_audit_logs").where({ entity_type: ENTITY_TYPE }).del();
      await masterKnex("audit_logs").where({ entity_type: ENTITY_TYPE }).del();
      if (userIds.length > 0) {
        await masterKnex("superadmin.admin_users").whereIn("platform_user_id", userIds).del();
        await masterKnex("platform_users").whereIn("id", userIds).del();
      }
    }
    await app?.close();
    await masterKnex?.destroy();
  });

  /** Scoped to this run's fixture rows so a shared DB cannot skew the assertions. */
  const list = (token: string, query = "") =>
    app.inject({
      method: "GET",
      url: `/api/v3/admin/audit-logs?entity_type=${ENTITY_TYPE}${query}`,
      headers: { authorization: `Bearer ${token}` },
    });

  // ── role guard ──

  describe("role guard", () => {
    it("rejects an unauthenticated request", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v3/admin/audit-logs" });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a platform_user token", async () => {
      const res = await list(platformUserToken);
      expect(res.statusCode).toBe(403);
    });

    it("rejects an admin whose role is not elevated", async () => {
      const res = await list(moderatorToken);
      expect(res.statusCode).toBe(403);
    });

    it("allows super_admin", async () => {
      expect((await list(superAdminToken)).statusCode).toBe(200);
    });

    it("allows data_admin", async () => {
      expect((await list(dataAdminToken)).statusCode).toBe(200);
    });
  });

  // ── shape ──

  describe("response shape", () => {
    it("returns a paginated envelope", async () => {
      const body = (await list(superAdminToken)).json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta).toEqual({
        page: 1,
        limit: 20,
        total: TOTAL_ROWS,
        totalPages: 1,
      });
    });

    it("normalises both tables onto one row shape", async () => {
      const body = (await list(superAdminToken)).json();
      for (const row of body.data) {
        expect(row).toMatchObject({
          id: expect.any(String),
          source: expect.stringMatching(/^(admin|platform)$/),
          action: expect.any(String),
          created_at: expect.any(String),
        });
        expect(row).toHaveProperty("actor_id");
        expect(row).toHaveProperty("actor_name");
        expect(row).toHaveProperty("actor_email");
        expect(row).toHaveProperty("entity_type");
        expect(row).toHaveProperty("entity_id");
        expect(row).toHaveProperty("details");
        expect(row).toHaveProperty("ip_address");
      }
    });

    it("resolves the actor's name and email", async () => {
      const body = (await list(superAdminToken, "&source=admin")).json();
      expect(body.data[0].actor_name).toBe("c4actor Fixture");
      expect(body.data[0].actor_email).toContain("c4actor");
    });

    it("returns newest first", async () => {
      const body = (await list(superAdminToken)).json();
      const times = body.data.map((r: { created_at: string }) => Date.parse(r.created_at));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      // platform rows were written later, so they lead
      expect(body.data[0].source).toBe("platform");
    });

    it("returns an empty page — not an error — when nothing matches", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/admin/audit-logs?entity_type=${ENTITY_TYPE}-nope`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    });
  });

  // ── pagination ──

  describe("pagination", () => {
    it("splits the rows across pages with no overlap and no gaps", async () => {
      const first = (await list(superAdminToken, "&page=1&limit=5")).json();
      const second = (await list(superAdminToken, "&page=2&limit=5")).json();
      const third = (await list(superAdminToken, "&page=3&limit=5")).json();

      expect(first.data).toHaveLength(5);
      expect(second.data).toHaveLength(5);
      expect(third.data).toHaveLength(TOTAL_ROWS - 10);
      expect(first.meta.totalPages).toBe(Math.ceil(TOTAL_ROWS / 5));

      const ids = [...first.data, ...second.data, ...third.data].map((r: { id: string }) => r.id);
      expect(new Set(ids).size).toBe(TOTAL_ROWS);
    });

    it("returns an empty page past the end", async () => {
      const body = (await list(superAdminToken, "&page=99&limit=5")).json();
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(TOTAL_ROWS);
    });

    it("rejects an out-of-range limit", async () => {
      expect((await list(superAdminToken, "&limit=0")).statusCode).toBe(400);
      expect((await list(superAdminToken, "&limit=101")).statusCode).toBe(400);
      expect((await list(superAdminToken, "&page=0")).statusCode).toBe(400);
    });
  });

  // ── filters ──

  describe("filters", () => {
    it("filters by source", async () => {
      const admin = (await list(superAdminToken, "&source=admin")).json();
      expect(admin.meta.total).toBe(ADMIN_ROWS);
      expect(admin.data.every((r: { source: string }) => r.source === "admin")).toBe(true);

      const platform = (await list(superAdminToken, "&source=platform")).json();
      expect(platform.meta.total).toBe(PLATFORM_ROWS);
      expect(platform.data.every((r: { source: string }) => r.source === "platform")).toBe(true);
    });

    it("filters by action", async () => {
      const body = (await list(superAdminToken, `&action=${ADMIN_ACTION}`)).json();
      expect(body.meta.total).toBe(ADMIN_ROWS);
      expect(body.data.every((r: { action: string }) => r.action === ADMIN_ACTION)).toBe(true);
    });

    it("filters by actor across both tables", async () => {
      const body = (await list(superAdminToken, `&actor_id=${otherUserId}`)).json();
      expect(body.meta.total).toBe(1);
      expect(body.data[0].source).toBe("platform");
    });

    it("filters by date range", async () => {
      const body = (await list(superAdminToken, "&from=2026-01-01T00:01:00Z")).json();
      // only the 5 platform rows sit at +100s and later
      expect(body.meta.total).toBe(PLATFORM_ROWS);

      const before = (await list(superAdminToken, "&to=2026-01-01T00:01:00Z")).json();
      expect(before.meta.total).toBe(ADMIN_ROWS);
    });

    it("rejects an unknown source", async () => {
      expect((await list(superAdminToken, "&source=nope")).statusCode).toBe(400);
    });
  });

  // ── detail ──

  describe("detail", () => {
    it("returns a single admin log by id", async () => {
      const first = (await list(superAdminToken, "&source=admin")).json().data[0];
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/admin/audit-logs/${first.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: first.id, source: "admin", action: ADMIN_ACTION });
    });

    it("returns a single platform log by id", async () => {
      const first = (await list(superAdminToken, "&source=platform")).json().data[0];
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/admin/audit-logs/${first.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: first.id, source: "platform", ip_address: "203.0.113.7" });
    });

    it("404s on an unknown id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/audit-logs/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("400s on a non-uuid id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/audit-logs/not-a-uuid",
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("enforces the same role guard as the list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/audit-logs/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${moderatorToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
