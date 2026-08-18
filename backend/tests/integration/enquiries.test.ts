// Enquiries (Wave D1): distance distribution, the credit-gated unlock, masking,
// cross-tenant isolation, and the digest worker.
//
// Everything runs offline. The only outbound dependency is mail, and the digest
// is driven through its service entry point with a capturing sender, so no broker
// and no SMTP are involved.
//
// Fixtures are built from scratch in beforeAll with a per-run suffix, so a
// sibling suite wiping the database cannot leave this one on stale rows.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

// Each run gets its own patch of the planet.
//
// The test database persists between runs and distribution is capped at
// MAX_DISTRIBUTIONS, so a previous run's fixtures — sitting at byte-identical
// coordinates — would tie on distance, win on lower id, and crowd this run's
// businesses out of every assertion. Same reasoning as billing.test.ts minting a
// fresh runId: shared state means fixture space has to be unique per run.
//
// The grid is 6° (≈667 km) apart in both axes. Fixtures spread at most 300 km
// from their own origin, so the closest any two runs' businesses can come is
// ~367 km — far outside DISTRIBUTION_RADIUS_KM (50). 1° of latitude is
// ~111.19 km, which is what makes the offsets below readable.
const RUN_CELL = Math.floor(Date.now() / 1000);
const ORIGIN = {
  lat: -50 + (RUN_CELL % 16) * 6,
  lng: -175 + (Math.floor(RUN_CELL / 16) % 58) * 6,
};
const KM_PER_DEGREE_LAT = 111.19;
const at = (km: number) => ({ lat: ORIGIN.lat - km / KM_PER_DEGREE_LAT, lng: ORIGIN.lng });

describeDb("enquiries", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let sign: (claims: Record<string, unknown>) => string;
  let digest: typeof import("../../src/modules/enquiries/services/digest.service.js");

  let suffix = "";
  let adminToken = "";

  interface Biz {
    id: number;
    schema: string;
    ownerId: number;
    token: string;
  }

  // Named by where they sit relative to ORIGIN / why they are (in)eligible.
  let near: Biz;      // 5 km  — verified, enquiry_enabled
  let mid: Biz;       // 35 km — verified, enquiry_enabled
  let far: Biz;       // 300 km — verified but outside the radius
  let noCoords: Biz;  // verified, enquiry_enabled, no lat/lng
  let disabled: Biz;  // 5 km but enquiry_enabled = false
  let unverified: Biz; // 5 km but status <> 'verified'

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });
    digest = await import("../../src/modules/enquiries/services/digest.service.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const enquiriesModule = (await import("../../src/modules/enquiries/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(enquiriesModule);
    });
    await app.ready();

    suffix = `${process.pid}${Date.now() % 1_000_000}`;
    sign = (claims) => jwt.sign({ email: "enq@vitest.local", ...claims }, config.JWT_SECRET as string);
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });

    const makeBusiness = async (
      label: string,
      opts: {
        lat?: number | null;
        lng?: number | null;
        status?: string;
        enquiry_enabled?: boolean;
        coin_cost?: number;
      },
    ): Promise<Biz> => {
      const [owner] = await masterKnex("platform_users")
        .insert({
          first_name: "Owner",
          last_name: label,
          email: uniqueEmail(`enq.owner.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: owner.id,
          subdomain: `enq-${label}-${suffix}`,
          business_name: `Enq ${label} ${suffix}`,
          email: uniqueEmail(`enq.biz.${label}`),
          account_status: 1,
          status: opts.status ?? "verified",
          enquiry_enabled: opts.enquiry_enabled ?? true,
          enquiry_coin_cost: opts.coin_cost ?? 30,
          latitude: opts.lat ?? null,
          longitude: opts.lng ?? null,
        })
        .returning(["id", "schema_name"]);
      return {
        id: Number(row.id),
        schema: row.schema_name,
        ownerId: Number(owner.id),
        token: sign({ sub: String(owner.id), type: "platform_user", orgId: row.schema_name }),
      };
    };

    const p5 = at(5);
    near = await makeBusiness("near", { lat: p5.lat, lng: p5.lng });
    const p35 = at(35);
    mid = await makeBusiness("mid", { lat: p35.lat, lng: p35.lng });
    const p300 = at(300);
    far = await makeBusiness("far", { lat: p300.lat, lng: p300.lng });
    noCoords = await makeBusiness("nocoords", {});
    disabled = await makeBusiness("disabled", { lat: p5.lat, lng: p5.lng, enquiry_enabled: false });
    unverified = await makeBusiness("unverified", { lat: p5.lat, lng: p5.lng, status: "unverified" });
  });

  afterAll(async () => {
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: (payload ?? {}) as object });

  /** A fresh student each time, so the 3-per-24h rate limit never bleeds between tests. */
  async function makeStudent(coords: { lat: number; lng: number } | null = ORIGIN) {
    const [user] = await masterKnex("platform_users")
      .insert({
        first_name: "Stu",
        last_name: `Dent${suffix}`,
        email: uniqueEmail("enq.student"),
        phone: "+61400000000",
        account_status: 1,
      })
      .returning(["id"]);
    await masterKnex("platform_user_profiles").insert({
      user_id: user.id,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      city_of_residence: "Sydney",
    });
    return {
      id: Number(user.id),
      token: sign({ sub: String(user.id), type: "platform_user" }),
    };
  }

  async function fundWallet(businessId: number, amount: number) {
    const existing = await masterKnex("credit_wallets").where({ business_id: businessId }).first();
    if (!existing) {
      await masterKnex("credit_wallets").insert({
        owner_type: "business",
        business_id: businessId,
        balance: amount,
        purchased_balance: amount,
        lifetime_earned: amount,
      });
      return;
    }
    await masterKnex("credit_wallets")
      .where({ id: existing.id })
      .update({ balance: amount, subscription_balance: 0, purchased_balance: amount });
  }

  const balanceOf = async (businessId: number) =>
    Number((await masterKnex("credit_wallets").where({ business_id: businessId }).first())?.balance ?? 0);

  async function createEnquiry(token: string, body: Record<string, unknown> = {}) {
    const res = await post("/api/v3/enquiries", token, {
      message: "I would like to study nursing in Sydney. Please advise on intakes and fees.",
      preferred_intake: "October",
      preferred_year: 2027,
      ...body,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  const distributionFor = async (enquiryId: number, businessId: number) =>
    masterKnex("enquiry_distributions").where({ enquiry_id: enquiryId, business_id: businessId }).first();

  // ── distribution by distance ──────────────────────────────────────────────

  describe("distance-based distribution", () => {
    it("selects businesses inside the radius and excludes everything else", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);

      const ids = created.recipients.map((r: { business_id: number }) => r.business_id);

      // In radius, eligible.
      expect(ids).toContain(near.id);
      expect(ids).toContain(mid.id);

      // 300 km away — outside DISTRIBUTION_RADIUS_KM.
      expect(ids).not.toContain(far.id);
      // No coordinates: unmeasurable, so not a distance match.
      expect(ids).not.toContain(noCoords.id);
      // Opted out of enquiries.
      expect(ids).not.toContain(disabled.id);
      // Not verified.
      expect(ids).not.toContain(unverified.id);

      // The recorded distance is the real great-circle figure, not a placeholder.
      const nearRow = created.recipients.find((r: { business_id: number }) => r.business_id === near.id);
      expect(Number(nearRow.distance_km)).toBeGreaterThan(4);
      expect(Number(nearRow.distance_km)).toBeLessThan(6);
      const midRow = created.recipients.find((r: { business_id: number }) => r.business_id === mid.id);
      expect(Number(midRow.distance_km)).toBeGreaterThan(33);
      expect(Number(midRow.distance_km)).toBeLessThan(37);

      // Nearest first.
      expect(ids.indexOf(near.id)).toBeLessThan(ids.indexOf(mid.id));

      // The lead is priced from the recipient's own enquiry_coin_cost.
      expect(nearRow.coin_cost).toBe(30);
      expect(created.distributed_to).toBe(ids.length);
    });

    it("distributes to a business the student named even though it is out of radius", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token, { agent_business_id: far.id });
      const ids = created.recipients.map((r: { business_id: number }) => r.business_id);
      expect(ids).toContain(far.id);
    });

    it("falls back to the eligible pool when the student has no coordinates", async () => {
      const student = await makeStudent(null);
      const created = await createEnquiry(student.token);
      const ids = created.recipients.map((r: { business_id: number }) => r.business_id);
      // With nothing to measure, distance cannot exclude anyone — but eligibility still does.
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).not.toContain(disabled.id);
      expect(ids).not.toContain(unverified.id);
      for (const r of created.recipients) expect(r.distance_km).toBeNull();
    });

    it("is idempotent — re-distributing the same enquiry adds nothing", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const before = await masterKnex("enquiry_distributions")
        .where({ enquiry_id: created.id })
        .count<{ count: string }[]>("id as count");

      const { distribute } = await import("../../src/modules/enquiries/services/distribution.service.js");
      const enquiry = await masterKnex("enquiries").where({ id: created.id }).first();
      const again = await distribute(enquiry);
      expect(again.distributed_to).toBe(0);

      const after = await masterKnex("enquiry_distributions")
        .where({ enquiry_id: created.id })
        .count<{ count: string }[]>("id as count");
      expect(Number(after[0].count)).toBe(Number(before[0].count));
    });

    it("ranks the target org's active representatives ahead of the rest", async () => {
      // `mid` is 35 km out and `near` is 5 km, so distance alone would order
      // near-then-mid. An active representation contract flips that.
      const [institution] = await masterKnex("institutions")
        .insert({
          platform_user_id: near.ownerId,
          first_name: "Inst",
          last_name: "Owner",
          email: uniqueEmail("enq.inst"),
          subdomain: `enq-inst-${suffix}`,
          institution_name: `Enq Institution ${suffix}`,
        })
        .returning(["id"]);
      await masterKnex("representations").insert({
        agent_org_type: "business",
        agent_org_id: mid.id,
        institution_org_type: "institution",
        institution_org_id: institution.id,
        status: "active",
      });

      const student = await makeStudent();
      const created = await createEnquiry(student.token, {
        target_org_type: "institution",
        target_org_id: institution.id,
      });
      const ids = created.recipients.map((r: { business_id: number }) => r.business_id);
      expect(ids).toContain(mid.id);
      expect(ids).toContain(near.id);
      expect(ids.indexOf(mid.id)).toBeLessThan(ids.indexOf(near.id));
    });

    it("ignores a named business that has opted out of enquiries", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token, { agent_business_id: disabled.id });
      const ids = created.recipients.map((r: { business_id: number }) => r.business_id);
      expect(ids).not.toContain(disabled.id);
    });

    it("refuses a fourth enquiry from the same student inside 24 hours", async () => {
      const student = await makeStudent();
      for (let i = 0; i < 3; i += 1) await createEnquiry(student.token);
      const fourth = await post("/api/v3/enquiries", student.token, { message: "one too many" });
      expect(fourth.statusCode).toBe(429);
      expect(fourth.json().code).toBe("ENQUIRY_RATE_LIMIT");
    });
  });

  // ── masking ───────────────────────────────────────────────────────────────

  describe("masking", () => {
    it("omits contact fields entirely while locked and reveals them once unlocked", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token, {
        message: "x".repeat(400), // long enough that the preview must truncate
      });
      const dist = await distributionFor(created.id, near.id);
      await fundWallet(near.id, 500);

      const locked = await get(`/api/v3/business/enquiries/${dist.id}`, near.token);
      expect(locked.statusCode).toBe(200);
      const lockedBody = locked.json();

      expect(lockedBody.unlocked).toBe(false);
      // Absent KEYS, not falsy values: a null `email` in the payload would still
      // assert that a contact email exists for this lead.
      expect(Object.keys(lockedBody)).not.toContain("message");
      expect(Object.keys(lockedBody.student)).not.toContain("email");
      expect(Object.keys(lockedBody.student)).not.toContain("phone");
      expect(Object.keys(lockedBody.student)).not.toContain("last_name");
      expect(Object.keys(lockedBody.student)).not.toContain("id");
      // And not smuggled in anywhere else in the payload.
      const lockedJson = JSON.stringify(lockedBody);
      const studentRow = await masterKnex("platform_users").where({ id: student.id }).first();
      expect(lockedJson).not.toContain(studentRow.email);
      expect(lockedJson).not.toContain(studentRow.phone);
      expect(lockedJson).not.toContain(studentRow.last_name);

      // What a locked lead DOES get: a first name and a truncated preview.
      expect(lockedBody.student.first_name).toBe("Stu");
      expect(lockedBody.message_preview.length).toBeLessThan(400);
      expect(lockedBody.message_preview.endsWith("…")).toBe(true);

      const unlock = await post(`/api/v3/business/enquiries/${dist.id}/unlock`, near.token);
      expect(unlock.statusCode).toBe(200);

      const opened = (await get(`/api/v3/business/enquiries/${dist.id}`, near.token)).json();
      expect(opened.unlocked).toBe(true);
      expect(opened.message).toBe("x".repeat(400));
      expect(opened.student.email).toBe(studentRow.email);
      expect(opened.student.phone).toBe(studentRow.phone);
      expect(opened.student.last_name).toBe(studentRow.last_name);
    });

    it("filters the inbox by distribution status and by unlocked state", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const dist = await distributionFor(created.id, near.id);
      await fundWallet(near.id, 500);

      const pending = (await get("/api/v3/business/enquiries?status=pending&limit=100", near.token)).json();
      expect(pending.data.map((r: { id: number }) => r.id)).toContain(dist.id);

      await post(`/api/v3/business/enquiries/${dist.id}/unlock`, near.token);

      const viewed = (await get("/api/v3/business/enquiries?status=viewed&limit=100", near.token)).json();
      expect(viewed.data.map((r: { id: number }) => r.id)).toContain(dist.id);

      const unlocked = (await get("/api/v3/business/enquiries?unlocked=true&limit=100", near.token)).json();
      expect(unlocked.data.map((r: { id: number }) => r.id)).toContain(dist.id);
      for (const row of unlocked.data) expect(row.unlocked).toBe(true);

      const stillLocked = (await get("/api/v3/business/enquiries?unlocked=false&limit=100", near.token)).json();
      expect(stillLocked.data.map((r: { id: number }) => r.id)).not.toContain(dist.id);
    });

    it("filters a student's own list by status", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const pending = (await get("/api/v3/enquiries?status=pending&limit=100", student.token)).json();
      expect(pending.data.map((e: { id: number }) => e.id)).toContain(created.id);
      expect(pending.data[0].distributed_to).toBeGreaterThan(0);

      const closed = (await get("/api/v3/enquiries?status=closed", student.token)).json();
      expect(closed.meta.total).toBe(0);
    });

    it("masks list rows the same way it masks a single row", async () => {
      const student = await makeStudent();
      await createEnquiry(student.token);
      const list = (await get("/api/v3/business/enquiries?unlocked=false", near.token)).json();
      expect(list.data.length).toBeGreaterThan(0);
      for (const row of list.data) {
        expect(row.unlocked).toBe(false);
        expect(Object.keys(row)).not.toContain("message");
        expect(Object.keys(row.student)).not.toContain("email");
      }
    });
  });

  // ── the monetised path ────────────────────────────────────────────────────

  describe("credit-gated unlock", () => {
    it("charges exactly once when two unlocks of the same lead land together", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const dist = await distributionFor(created.id, near.id);
      await fundWallet(near.id, 500);
      const before = await balanceOf(near.id);

      // Genuinely parallel: two independent request lifecycles, two pool
      // connections, two transactions racing for the same UNIQUE index.
      const [a, b] = await Promise.all([
        post(`/api/v3/business/enquiries/${dist.id}/unlock`, near.token),
        post(`/api/v3/business/enquiries/${dist.id}/unlock`, near.token),
      ]);

      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect([a, b].filter((r) => r.json().already_unlocked === false)).toHaveLength(1);
      expect([a, b].filter((r) => r.json().already_unlocked === true)).toHaveLength(1);

      // The ledger is the assertion, not the response bodies.
      const unlocks = await masterKnex("enquiry_unlocks")
        .where({ distribution_id: dist.id })
        .count<{ count: string }[]>("id as count");
      expect(Number(unlocks[0].count)).toBe(1);

      const wallet = await masterKnex("credit_wallets").where({ business_id: near.id }).first();
      const debits = await masterKnex("credit_transactions")
        .where({ wallet_id: wallet.id, transaction_type: "enquiry_unlock", reference_id: String(created.id) })
        .select("amount", "idempotency_key");
      expect(debits).toHaveLength(1);
      expect(debits[0].amount).toBe(-dist.coin_cost);
      expect(debits[0].idempotency_key).toBe(`enquiry_unlock:${dist.id}`);

      expect(await balanceOf(near.id)).toBe(before - dist.coin_cost);
    });

    it("returns 402 and writes no unlock when the wallet cannot cover the lead", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const dist = await distributionFor(created.id, near.id);
      await fundWallet(near.id, 5); // coin_cost is 30

      const res = await post(`/api/v3/business/enquiries/${dist.id}/unlock`, near.token);
      expect(res.statusCode).toBe(402);
      expect(res.json().code).toBe("INSUFFICIENT_CREDITS");

      // Nothing was written and nothing was spent — the claim rolled back with
      // the failed debit rather than leaving a free unlock behind.
      const unlocks = await masterKnex("enquiry_unlocks").where({ distribution_id: dist.id });
      expect(unlocks).toHaveLength(0);
      expect(await balanceOf(near.id)).toBe(5);

      const wallet = await masterKnex("credit_wallets").where({ business_id: near.id }).first();
      const replay = await masterKnex("credit_transactions").where({
        wallet_id: wallet.id,
        idempotency_key: `enquiry_unlock:${dist.id}`,
      });
      expect(replay).toHaveLength(0);

      // And the lead is still unlockable once the wallet is topped up.
      await fundWallet(near.id, 500);
      const retry = await post(`/api/v3/business/enquiries/${dist.id}/unlock`, near.token);
      expect(retry.statusCode).toBe(200);
      expect(retry.json().already_unlocked).toBe(false);
    });

    it("moves the distribution and the enquiry to 'viewed' on unlock", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const dist = await distributionFor(created.id, near.id);
      await fundWallet(near.id, 500);

      expect((await post(`/api/v3/business/enquiries/${dist.id}/unlock`, near.token)).statusCode).toBe(200);
      expect((await distributionFor(created.id, near.id)).status).toBe("viewed");
      expect((await masterKnex("enquiries").where({ id: created.id }).first()).status).toBe("viewed");
    });
  });

  // ── isolation ─────────────────────────────────────────────────────────────

  describe("cross-tenant isolation", () => {
    it("hides and refuses another business's distribution", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const nearDist = await distributionFor(created.id, near.id);
      await fundWallet(mid.id, 500);
      const midBefore = await balanceOf(mid.id);

      // A 404, not a 403 — a 403 would confirm the id exists.
      expect((await get(`/api/v3/business/enquiries/${nearDist.id}`, mid.token)).statusCode).toBe(404);

      const stolen = await post(`/api/v3/business/enquiries/${nearDist.id}/unlock`, mid.token);
      expect(stolen.statusCode).toBe(404);
      expect(await balanceOf(mid.id)).toBe(midBefore);
      expect(await masterKnex("enquiry_unlocks").where({ distribution_id: nearDist.id })).toHaveLength(0);

      // And mid's own inbox never lists near's distribution.
      const midInbox = (await get("/api/v3/business/enquiries?limit=100", mid.token)).json();
      expect(midInbox.data.map((r: { id: number }) => r.id)).not.toContain(nearDist.id);
    });

    it("refuses the inbox without a business context", async () => {
      const student = await makeStudent();
      expect((await get("/api/v3/business/enquiries", student.token)).statusCode).toBe(403);
    });

    it("shows a student only their own enquiries", async () => {
      const mine = await makeStudent();
      const theirs = await makeStudent();
      const created = await createEnquiry(mine.token);

      expect((await get(`/api/v3/enquiries/${created.id}`, mine.token)).statusCode).toBe(200);
      expect((await get(`/api/v3/enquiries/${created.id}`, theirs.token)).statusCode).toBe(404);

      const list = (await get("/api/v3/enquiries?limit=100", theirs.token)).json();
      expect(list.data.map((e: { id: number }) => e.id)).not.toContain(created.id);
    });

    it("rejects an unauthenticated call", async () => {
      expect((await app.inject({ method: "GET", url: "/api/v3/enquiries" })).statusCode).toBe(401);
    });
  });

  // ── admin monitoring ──────────────────────────────────────────────────────

  describe("admin monitoring", () => {
    it("lists enquiries with distribution and revenue counts", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const dist = await distributionFor(created.id, near.id);
      await fundWallet(near.id, 500);
      await post(`/api/v3/business/enquiries/${dist.id}/unlock`, near.token);

      const res = await get(`/api/v3/admin/monitoring/enquiries?student_id=${student.id}`, adminToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.meta.total).toBe(1);
      const row = body.data[0];
      expect(row.id).toBe(created.id);
      expect(row.student_email).toBeTruthy();
      expect(row.distributed_to).toBeGreaterThan(0);
      expect(row.unlocked_count).toBe(1);
      expect(row.credits_earned).toBe(dist.coin_cost);
    });

    it("reports platform-wide stats", async () => {
      const res = await get("/api/v3/admin/monitoring/enquiries/stats", adminToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.enquiries.total).toBeGreaterThan(0);
      expect(body.distributions_total).toBeGreaterThan(0);
      expect(body.unlocks.total).toBeGreaterThan(0);
      expect(body.unlocks.credits_spent).toBeGreaterThan(0);
      expect(body.digest_queue).toHaveProperty("pending");
    });

    it("filters by status and by recipient business", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);

      const byStatus = (
        await get(`/api/v3/admin/monitoring/enquiries?student_id=${student.id}&status=pending`, adminToken)
      ).json();
      expect(byStatus.data.map((e: { id: number }) => e.id)).toContain(created.id);

      const byOther = (
        await get(`/api/v3/admin/monitoring/enquiries?student_id=${student.id}&status=closed`, adminToken)
      ).json();
      expect(byOther.meta.total).toBe(0);

      const byBusiness = (
        await get(`/api/v3/admin/monitoring/enquiries?business_id=${near.id}&limit=100`, adminToken)
      ).json();
      expect(byBusiness.data.map((e: { id: number }) => e.id)).toContain(created.id);

      const byWrongBusiness = (
        await get(`/api/v3/admin/monitoring/enquiries?business_id=${disabled.id}&limit=100`, adminToken)
      ).json();
      expect(byWrongBusiness.data.map((e: { id: number }) => e.id)).not.toContain(created.id);
    });

    it("refuses a non-admin", async () => {
      const student = await makeStudent();
      expect((await get("/api/v3/admin/monitoring/enquiries", student.token)).statusCode).toBe(403);
    });
  });

  // ── digest worker ─────────────────────────────────────────────────────────

  describe("digest worker", () => {
    it("is idempotent over a re-delivered message", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const dist = await distributionFor(created.id, near.id);

      // Distribution queued a digest row for every recipient.
      const queued = await masterKnex("enquiry_email_queue").where({ distribution_id: dist.id }).first();
      expect(queued.status).toBe("pending");

      const sentFirst: Array<{ to: string; subject: string }> = [];
      const first = await digest.runDigest(async (email) => {
        sentFirst.push({ to: email.to, subject: email.subject });
      });
      expect(first.claimed).toBeGreaterThan(0);
      expect(first.emails_sent).toBeGreaterThan(0);
      expect(
        (await masterKnex("enquiry_email_queue").where({ distribution_id: dist.id }).first()).status,
      ).toBe("sent");

      // Same message delivered again: nothing left to claim, so nothing is sent.
      const sentSecond: string[] = [];
      const second = await digest.runDigest(async (email) => {
        sentSecond.push(email.to);
      });
      expect(second.claimed).toBe(0);
      expect(second.emails_sent).toBe(0);
      expect(sentSecond).toHaveLength(0);
    });

    it("batches one email per business and never leaks the message body", async () => {
      const student = await makeStudent();
      await createEnquiry(student.token);
      await createEnquiry(student.token);

      const sent: Array<{ to: string; html: string; subject: string }> = [];
      const result = await digest.runDigest(async (email) => {
        sent.push({ to: email.to, html: email.html, subject: email.subject });
      });

      expect(result.claimed).toBeGreaterThanOrEqual(2);
      // One email per business, not one per lead.
      expect(new Set(sent.map((e) => e.to)).size).toBe(sent.length);
      expect(sent.length).toBeLessThan(result.claimed);

      const studentRow = await masterKnex("platform_users").where({ id: student.id }).first();
      for (const email of sent) {
        expect(email.html).toContain("Stu"); // teaser: first name only
        expect(email.html).not.toContain(studentRow.email);
        expect(email.html).not.toContain(studentRow.last_name);
      }
    });

    it("marks a batch failed rather than reporting a bounced digest as delivered", async () => {
      const student = await makeStudent();
      const created = await createEnquiry(student.token);
      const dist = await distributionFor(created.id, near.id);

      const result = await digest.runDigest(async () => {
        throw new Error("smtp exploded");
      });
      expect(result.claimed).toBeGreaterThan(0);
      expect(result.emails_sent).toBe(0);

      const row = await masterKnex("enquiry_email_queue").where({ distribution_id: dist.id }).first();
      expect(row.status).toBe("failed");
      expect(row.last_error).toContain("smtp exploded");
      expect(row.sent_at).toBeNull();
    });
  });
});
