// Waitlist — V2's waitlist.ts: public sign-up + super-admin listing.
//
// THIS TABLE IS NOTHING BUT PII (email, name, self-declared type), so the guard
// this suite exists to hold is narrow and explicit:
//
//   * the public surface is POST-only and its response body carries NO column from
//     the table — not even an echo of the address that was just submitted;
//   * there is no unauthenticated read of any kind;
//   * the admin read is admin-only and names its columns.
//
// Two leaks of exactly the `select *` / bare `.first()` shape have already been
// caught in this program, which is why the assertions below read the route's
// response rather than trusting the query.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { queueService as queue } from "../../src/shared/queue/queueService.js";
import type { PublishedEmail } from "../helpers/mail-capture.js";

// The confirmation mail goes through the existing "emails" queue (same path the
// notification fan-out uses) rather than opening a second SMTP client.
const { published } = vi.hoisted(() => ({ published: [] as PublishedEmail[] }));
vi.mock("../../src/shared/queue/queueService.js", () => ({
  queueService: {
    publish: async (queue: string, message: unknown) => {
      published.push({ queue, message } as never);
    },
  },
  default: {},
}));

const describeDb = describe.skipIf(!dbAvailable);

describeDb("waitlist", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, any>;

  let runId = "";
  let adminToken = "";
  let userToken = "";
  let student = 0;

  const emailFor = (label: string) => `waitlist.${label}.${runId}@vitest.local`;
  const created: string[] = [];

  const signUp = (payload: unknown) =>
    app.inject({ method: "POST", url: "/api/v3/waitlist", payload: payload as object });
  const register = (label: string, over: Record<string, unknown> = {}) => {
    const email = over.email === undefined ? emailFor(label) : (over.email as string);
    if (typeof email === "string") created.push(email.toLowerCase());
    return signUp({ email, name: "Ada Lovelace", type: "student", ...over });
  };
  const mailsTo = (email: string) =>
    published.filter((p) => p.queue === "emails" && p.message?.to === email.toLowerCase());

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as { config: Record<string, any> });

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const waitlistModule = await import("../../src/modules/waitlist/index.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    // Admin listing sits inside the protected scope; sign-up sits outside it, the
    // same split events/scholarships use.
    await app.register(async (protectedApp) => {
      await protectedApp.register(authPlugin);
      await protectedApp.register(waitlistModule.adminWaitlistModule);
    });
    await app.register(waitlistModule.publicWaitlistModule);
    await app.ready();

    runId = `${process.pid}${Date.now() % 1_000_000}`;

    const [row] = await masterKnex("platform_users")
      .insert({
        first_name: "Wait",
        last_name: "List",
        email: `waitlist.student.${process.pid}.${Date.now()}@vitest.local`,
        account_status: 1,
      })
      .returning(["id"]);
    student = row.id as number;

    adminToken = jwt.sign(
      { sub: "1", type: "admin", role: "super_admin", email: "admin@vitest.local" },
      config.JWT_SECRET as string,
    );
    userToken = jwt.sign(
      { sub: String(student), type: "platform_user", email: "student@vitest.local" },
      config.JWT_SECRET as string,
    );
  });

  afterAll(async () => {
    await masterKnex?.("waitlist_registrations").whereIn("email", created).del();
    await masterKnex?.("platform_users").whereIn("id", [student]).del();
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── public sign-up ────────────────────────────────────────────────────────

  it("accepts a sign-up with no token at all", async () => {
    const res = await register("new");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, already_registered: false });

    const row = await masterKnex("waitlist_registrations").where({ email: emailFor("new") }).first();
    expect(row.name).toBe("Ada Lovelace");
    expect(row.registrant_type).toBe("student");
  });

  it("never echoes the submitted PII back in the response", async () => {
    const res = await register("silent");
    const body = res.json();
    // The whole response, serialised — no address, no name, anywhere in it.
    expect(Object.keys(body).sort()).toEqual(["already_registered", "ok"]);
    expect(res.payload).not.toContain("silent");
    expect(res.payload).not.toContain("Ada");
  });

  it("is idempotent, and does not reveal that an address was already on the list", async () => {
    await register("dup");
    const second = await register("dup");
    expect(second.statusCode).toBe(200);
    // ok:true either way — a repeat submit is a success, not a 409 that would let
    // an anonymous caller probe the list for a known address.
    expect(second.json().ok).toBe(true);
    expect(second.json().already_registered).toBe(true);

    const rows = await masterKnex("waitlist_registrations").where({ email: emailFor("dup") });
    expect(rows).toHaveLength(1);
  });

  it("folds the address to lower case so the unique index cannot be defeated", async () => {
    const mixed = `WaitList.Case.${runId}@Vitest.Local`;
    created.push(mixed.toLowerCase());
    expect((await signUp({ email: mixed, name: "Case", type: "other" })).statusCode).toBe(200);

    const again = await signUp({ email: mixed.toLowerCase(), name: "Case", type: "other" });
    expect(again.json().already_registered).toBe(true);
    expect(await masterKnex("waitlist_registrations").where({ email: mixed }).first()).toBeUndefined();
    expect(await masterKnex("waitlist_registrations").where({ email: mixed.toLowerCase() }).first()).toBeDefined();
  });

  it("emails a genuinely new registrant exactly once", async () => {
    published.length = 0;
    await register("mailed");
    expect(mailsTo(emailFor("mailed"))).toHaveLength(1);

    // A repeat submit must not re-spam, and must not confirm anything either.
    await register("mailed");
    expect(mailsTo(emailFor("mailed"))).toHaveLength(1);
  });

  it("validates untrusted input at the boundary", async () => {
    const bad: Array<Record<string, unknown>> = [
      { email: "not-an-email" },
      { email: "" },
      { email: `${"a".repeat(400)}@vitest.local` },
      { name: "" },
      { name: "   " },
      { name: "x".repeat(200) },
      { type: "hacker" },
      { type: "" },
    ];
    for (const over of bad) {
      const res = await signUp({ email: emailFor("valid"), name: "Ada", type: "student", ...over });
      expect(res.statusCode, JSON.stringify(over)).toBe(400);
    }
    expect(await masterKnex("waitlist_registrations").where({ email: emailFor("valid") }).first()).toBeUndefined();
  });

  it("400s a request with no body at all", async () => {
    // Exercises the `req.body ?? {}` fallback: a bodyless POST must be a validation
    // error, not a crash on undefined.
    expect((await app.inject({ method: "POST", url: "/api/v3/waitlist" })).statusCode).toBe(400);
  });

  it("still registers the sign-up when the confirmation mail cannot be enqueued", async () => {
    // The row is committed before the mail is queued, so a broker outage must not
    // fail a sign-up that already succeeded — it is logged for replay instead.
    const boom = new Error("broker down");
    const spy = vi.spyOn(queue, "publish").mockRejectedValueOnce(boom);
    try {
      const res = await register("mailfail");
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, already_registered: false });
      expect(await masterKnex("waitlist_registrations").where({ email: emailFor("mailfail") }).first())
        .toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects unknown keys rather than storing them", async () => {
    const res = await signUp({ email: emailFor("strict"), name: "Ada", type: "student", id: 1 });
    expect(res.statusCode).toBe(400);
  });

  // ── no anonymous read (the PII guard) ─────────────────────────────────────

  it("exposes no unauthenticated read of the waitlist", async () => {
    await register("secret");

    for (const url of ["/api/v3/waitlist", "/api/v3/admin/waitlist"]) {
      const res = await app.inject({ method: "GET", url });
      // 404 (no such public route) or 401 (protected) — never 200.
      expect([401, 404], `${url} -> ${res.statusCode}`).toContain(res.statusCode);
      expect(res.payload).not.toContain(emailFor("secret"));
    }
  });

  it("refuses the admin listing to a signed-in student", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v3/admin/waitlist",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain("@vitest.local");
  });

  // ── admin listing ─────────────────────────────────────────────────────────

  it("lists registrations for an admin, newest first, with named columns only", async () => {
    await register("listed");
    const res = await app.inject({
      method: "GET",
      url: "/api/v3/admin/waitlist?limit=100",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    const row = body.data.find((r: any) => r.email === emailFor("listed"));
    expect(row).toBeDefined();
    // Explicitly enumerated — a `select *` would leak whatever a later wave adds.
    expect(Object.keys(row).sort()).toEqual(["created_at", "email", "id", "name", "type"]);
    expect(body.meta.total).toBeGreaterThan(0);

    const ids = body.data.map((r: any) => r.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => b - a));
  });
});
