// Ambassador ops (Wave G4): programs, applications, roster promotion, inquiry
// matching + timeout reroute, chat, the digest, cross-tenant isolation, the
// public PII boundary, and the Stripe Connect payout path.
//
// Everything runs offline. The only outbound dependencies are Stripe (stubbed
// through billing's setStripeClient seam — and deliberately UNSTUBBED for the
// fail-closed assertions) and mail (the digest is driven through its service
// entry point with a capturing sender, so no broker and no SMTP).
//
// Fixtures are built from scratch in beforeAll with a per-run suffix, so a
// sibling suite wiping the database cannot leave this one on stale rows.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("ambassadors", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let sign: (claims: Record<string, unknown>) => string;
  let stripe: typeof import("../../src/modules/billing/services/stripe.client.js");
  let digest: typeof import("../../src/modules/ambassadors/services/digest.service.js");
  let timeout: typeof import("../../src/modules/ambassadors/services/timeout.service.js");

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

  // Programs
  let programA = 0;
  let programB = 0;
  let slugA = "";

  // People
  let ambUser = 0; // becomes an ambassador on programA
  let ambToken = "";
  let ambId = 0;
  let secondAmbUser = 0;
  let secondAmbId = 0;
  let prospectUser = 0;
  let prospectToken = "";
  let applicantUser = 0;

  /** Minimal StripeClient stub: only the Connect surface this module uses. */
  function makeStripeStub(runId: string) {
    let counter = 0;
    const transfers: { id: string; amount: number; idempotencyKey: string }[] = [];
    const client = {
      async createConnectAccount() {
        counter += 1;
        return { id: `acct_${runId}_${counter}`, details_submitted: false };
      },
      async retrieveConnectAccount(id: string) {
        return { id, details_submitted: true };
      },
      async createAccountLink({ accountId }: { accountId: string }) {
        return { url: `https://stripe.test/onboard/${accountId}` };
      },
      async createTransfer(params: {
        amount: number;
        currency: string;
        destination: string;
        idempotencyKey: string;
      }) {
        counter += 1;
        const id = `tr_${runId}_${counter}`;
        transfers.push({ id, amount: params.amount, idempotencyKey: params.idempotencyKey });
        return {
          id,
          amount: params.amount,
          currency: params.currency,
          destination: params.destination,
        };
      },
    };
    return { client, transfers };
  }
  let stub: ReturnType<typeof makeStripeStub>;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });
    stripe = await import("../../src/modules/billing/services/stripe.client.js");
    digest = await import("../../src/modules/ambassadors/services/digest.service.js");
    timeout = await import("../../src/modules/ambassadors/services/timeout.service.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import(
      "../../src/core/plugins/request-context.plugin.js"
    );
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const ambassadorsModule = await import("../../src/modules/ambassadors/index.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(ambassadorsModule.default);
    });
    // Public reads are registered OUTSIDE the auth scope, exactly as in server.ts.
    await app.register(ambassadorsModule.publicAmbassadorsModule);
    await app.ready();

    suffix = `${process.pid}${Date.now() % 1_000_000}`;
    stub = makeStripeStub(suffix);
    sign = (claims) => jwt.sign({ email: "amb@vitest.local", ...claims }, config.JWT_SECRET as string);
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });

    const makeUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Amb",
          last_name: label,
          email: uniqueEmail(`amb.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return row.id as number;
    };

    const makeBusiness = async (label: string): Promise<Biz> => {
      const ownerId = await makeUser(`owner.${label}`);
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: ownerId,
          subdomain: `amb-${label}-${suffix}`,
          business_name: `Amb ${label} ${suffix}`,
          email: `amb.${label}.${suffix}@vitest.local`,
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

    ambUser = await makeUser("amb1");
    ambToken = sign({ sub: String(ambUser), type: "platform_user" });
    secondAmbUser = await makeUser("amb2");
    prospectUser = await makeUser("prospect");
    prospectToken = sign({ sub: String(prospectUser), type: "platform_user" });
    applicantUser = await makeUser("applicant");

  });

  afterAll(async () => {
    stripe.setStripeClient(null);
    await app?.close();
    await masterKnex?.destroy();
    await shutdownPools?.();
  });

  // ── Programs ──────────────────────────────────────────────────────────────

  describe("programs", () => {
    it("creates a program owned by the caller's business", async () => {
      slugA = `amb-prog-a-${suffix}`;
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/business/ambassadors/programs",
        headers: auth(bizA.token),
        payload: {
          name: "Study buddies A",
          slug: slugA,
          description: "Chat to a current student",
          status: "active",
          compensation_model: { per_resolution_minor: 1500 },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.business_id).toBe(bizA.id);
      expect(body.created_by).toBe(bizA.ownerId);
      programA = body.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/v3/business/ambassadors/programs",
        headers: auth(bizB.token),
        payload: { name: "Study buddies B", slug: `amb-prog-b-${suffix}`, status: "active" },
      });
      expect(resB.statusCode).toBe(201);
      programB = resB.json().id;
    });

    it("rejects a body that tries to set business_id itself", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/business/ambassadors/programs",
        headers: auth(bizA.token),
        payload: { name: "Spoof", slug: `spoof-${suffix}`, business_id: bizB.id },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects a javascript: welcome video URL", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/business/ambassadors/programs",
        headers: auth(bizA.token),
        payload: {
          name: "XSS",
          slug: `xss-${suffix}`,
          welcome_video_url: "javascript:alert(document.cookie)",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("409s on a duplicate slug", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/business/ambassadors/programs",
        headers: auth(bizB.token),
        payload: { name: "Clash", slug: slugA },
      });
      expect(res.statusCode).toBe(409);
    });

    it("requires business context", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/programs",
        headers: auth(ambToken),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Cross-tenant isolation (a tested security requirement) ────────────────

  describe("cross-tenant isolation", () => {
    it("business A never sees business B's programs in its list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/programs?limit=100",
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.map((p: { id: number }) => p.id);
      expect(ids).toContain(programA);
      expect(ids).not.toContain(programB);
    });

    it("404s (not 403s) when A reads B's program by id", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/programs/${programB}`,
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(404);
    });

    it("404s when A tries to patch or delete B's program", async () => {
      const patched = await app.inject({
        method: "PATCH",
        url: `/api/v3/business/ambassadors/programs/${programB}`,
        headers: auth(bizA.token),
        payload: { name: "hijacked" },
      });
      expect(patched.statusCode).toBe(404);

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/v3/business/ambassadors/programs/${programB}`,
        headers: auth(bizA.token),
      });
      expect(deleted.statusCode).toBe(404);

      const still = await masterKnex("ambassador_programs").where({ id: programB }).first();
      expect(still.name).toBe("Study buddies B");
      expect(still.deleted_at).toBeNull();
    });

    it("404s when A reads applications under B's program", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/programs/${programB}/applications`,
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Applications + roster promotion ───────────────────────────────────────

  describe("applications", () => {
    let applicationId = 0;

    it("lets a student apply once", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/applications",
        headers: auth(ambToken),
        payload: {
          program_id: programA,
          application_data: { motivation: "I love it here", major: "Nursing", year: 2 },
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().student_id).toBe(ambUser);
      applicationId = res.json().id;
    });

    it("409s on a second application to the same program", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/applications",
        headers: auth(ambToken),
        payload: { program_id: programA, application_data: {} },
      });
      expect(res.statusCode).toBe(409);
    });

    it("promotes the applicant to the roster on accept, in one transaction", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v3/business/ambassadors/programs/${programA}/applications/${applicationId}`,
        headers: auth(bizA.token),
        payload: { status: "accepted" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("accepted");
      expect(res.json().decided_at).not.toBeNull();

      const ambassador = await masterKnex("ambassadors")
        .where({ user_id: ambUser, program_id: programA })
        .first();
      expect(ambassador).toBeTruthy();
      expect(ambassador.major).toBe("Nursing");
      expect(ambassador.status).toBe("active");
      ambId = ambassador.id;
    });

    it("is idempotent — accepting twice does not create a second roster row", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v3/business/ambassadors/programs/${programA}/applications/${applicationId}`,
        headers: auth(bizA.token),
        payload: { status: "accepted" },
      });
      expect(res.statusCode).toBe(200);
      const rows = await masterKnex("ambassadors").where({
        user_id: ambUser,
        program_id: programA,
      });
      expect(rows).toHaveLength(1);
    });

    it("stores one mutable note per application", async () => {
      const put = await app.inject({
        method: "PUT",
        url: `/api/v3/business/ambassadors/applications/${applicationId}/notes`,
        headers: auth(bizA.token),
        payload: { notes: "Strong candidate" },
      });
      expect(put.statusCode).toBe(200);

      const again = await app.inject({
        method: "PUT",
        url: `/api/v3/business/ambassadors/applications/${applicationId}/notes`,
        headers: auth(bizA.token),
        payload: { notes: "Revised" },
      });
      expect(again.json().note.notes).toBe("Revised");

      const rows = await masterKnex("ambassador_application_notes").where({
        application_id: applicationId,
      });
      expect(rows).toHaveLength(1);
    });

    it("404s when business B reads A's application notes", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/applications/${applicationId}/notes`,
        headers: auth(bizB.token),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Ambassador self-service ───────────────────────────────────────────────

  describe("ambassador profile", () => {
    it("returns the caller's own ambassadorship with its balances", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/me/ambassador/profile",
        headers: auth(ambToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(ambId);
      expect(res.json().available_earnings_minor).toBe(0);
      expect(res.json().program_name).toBe("Study buddies A");
    });

    it("404s for a user who is not an ambassador", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/me/ambassador/profile",
        headers: auth(prospectToken),
      });
      expect(res.statusCode).toBe(404);
    });

    it("patches only the self-editable fields", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v3/me/ambassador/profile",
        headers: auth(ambToken),
        payload: { bio: "Third-year nursing student", is_online: true, country_of_origin: "India" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().bio).toBe("Third-year nursing student");
      expect(res.json().is_online).toBe(true);
    });

    it("rejects an attempt to grant itself earnings or change status", async () => {
      for (const payload of [
        { available_earnings_minor: 100_000 },
        { status: "active", bio: "x" },
        { program_id: programB },
      ]) {
        const res = await app.inject({
          method: "PATCH",
          url: "/api/v3/me/ambassador/profile",
          headers: auth(ambToken),
          payload,
        });
        expect(res.statusCode).toBe(400);
      }
      const row = await masterKnex("ambassadors").where({ id: ambId }).first();
      expect(row.available_earnings_minor).toBe(0);
      expect(row.program_id).toBe(programA);
    });
  });

  // ── Inquiries: matching, chat, resolution, timeout ────────────────────────

  describe("inquiries", () => {
    let inquiryId = 0;
    let threadId = 0;

    it("matches a new inquiry to an online ambassador with an accept window", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/inquiries",
        headers: auth(prospectToken),
        payload: {
          program_id: programA,
          first_message: "What is placement like?",
          inquiry_context: { country_of_origin: "India" },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe("matched");
      expect(body.ambassador_id).toBe(ambId);
      expect(body.expires_at).not.toBeNull();
      inquiryId = body.id;
    });

    it("shows the inquiry in the assigned ambassador's queue", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/me/ambassador/inquiries",
        headers: auth(ambToken),
      });
      expect(res.json().data.map((i: { id: number }) => i.id)).toContain(inquiryId);
    });

    it("403s when someone who is not a participant reads the inquiry", async () => {
      const stranger = sign({ sub: String(applicantUser), type: "platform_user" });
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/me/ambassador/inquiries/${inquiryId}`,
        headers: auth(stranger),
      });
      expect(res.statusCode).toBe(403);
    });

    it("accepts the inquiry and clears the accept window", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v3/me/ambassador/inquiries/${inquiryId}`,
        headers: auth(ambToken),
        payload: { status: "accepted" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("accepted");
      expect(res.json().expires_at).toBeNull();
    });

    it("403s when a different ambassador tries to move the same inquiry", async () => {
      const other = await masterKnex("ambassadors")
        .insert({ user_id: secondAmbUser, program_id: programA, status: "active", is_online: true })
        .returning(["id"]);
      secondAmbId = other[0].id;
      const otherToken = sign({ sub: String(secondAmbUser), type: "platform_user" });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v3/me/ambassador/inquiries/${inquiryId}`,
        headers: auth(otherToken),
        payload: { status: "resolved" },
      });
      expect(res.statusCode).toBe(403);
      const row = await masterKnex("ambassador_inquiries").where({ id: inquiryId }).first();
      expect(row.status).toBe("accepted");
    });

    it("opens one thread per inquiry, whoever asks first", async () => {
      const first = await app.inject({
        method: "POST",
        url: `/api/v3/me/ambassador/inquiries/${inquiryId}/thread`,
        headers: auth(prospectToken),
      });
      expect(first.statusCode).toBe(200);
      threadId = first.json().id;
      expect(first.json().participants).toEqual(
        expect.arrayContaining([prospectUser, ambUser]),
      );

      const second = await app.inject({
        method: "POST",
        url: `/api/v3/me/ambassador/inquiries/${inquiryId}/thread`,
        headers: auth(ambToken),
      });
      expect(second.json().id).toBe(threadId);
    });

    it("derives sender_type server-side and advances the inquiry on the ambassador's reply", async () => {
      const fromProspect = await app.inject({
        method: "POST",
        url: `/api/v3/me/ambassador/threads/${threadId}/messages`,
        headers: auth(prospectToken),
        payload: { message_text: "Hello!" },
      });
      expect(fromProspect.statusCode).toBe(201);
      expect(fromProspect.json().sender_type).toBe("prospect");
      // A prospect's message must not start the clock on work not yet begun.
      let row = await masterKnex("ambassador_inquiries").where({ id: inquiryId }).first();
      expect(row.status).toBe("accepted");

      const fromAmbassador = await app.inject({
        method: "POST",
        url: `/api/v3/me/ambassador/threads/${threadId}/messages`,
        headers: auth(ambToken),
        payload: { message_text: "Hi, happy to help" },
      });
      expect(fromAmbassador.json().sender_type).toBe("ambassador");
      row = await masterKnex("ambassador_inquiries").where({ id: inquiryId }).first();
      expect(row.status).toBe("in_progress");
    });

    it("403s a non-participant reading the transcript", async () => {
      const stranger = sign({ sub: String(applicantUser), type: "platform_user" });
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/me/ambassador/threads/${threadId}/messages`,
        headers: auth(stranger),
      });
      expect(res.statusCode).toBe(403);
    });

    it("credits the ledger exactly once on resolution", async () => {
      const first = await app.inject({
        method: "PATCH",
        url: `/api/v3/me/ambassador/inquiries/${inquiryId}`,
        headers: auth(ambToken),
        payload: { status: "resolved" },
      });
      expect(first.statusCode).toBe(200);

      let earnings = await masterKnex("ambassador_earnings").where({ inquiry_id: inquiryId });
      expect(earnings).toHaveLength(1);
      expect(earnings[0].net_amount_minor).toBe(1500);
      let amb = await masterKnex("ambassadors").where({ id: ambId }).first();
      expect(amb.available_earnings_minor).toBe(1500);

      // Resolving again must not pay again.
      await app.inject({
        method: "PATCH",
        url: `/api/v3/me/ambassador/inquiries/${inquiryId}`,
        headers: auth(ambToken),
        payload: { status: "resolved" },
      });
      earnings = await masterKnex("ambassador_earnings").where({ inquiry_id: inquiryId });
      expect(earnings).toHaveLength(1);
      amb = await masterKnex("ambassadors").where({ id: ambId }).first();
      expect(amb.available_earnings_minor).toBe(1500);
    });
  });

  // ── Timeout worker ────────────────────────────────────────────────────────

  describe("accept-timeout reroute (V1 process-ambassador-timeout)", () => {
    it("reroutes an expired inquiry to the next online ambassador", async () => {
      const [row] = await masterKnex("ambassador_inquiries")
        .insert({
          program_id: programA,
          prospect_id: prospectUser,
          ambassador_id: ambId,
          status: "matched",
          first_message: "anyone there?",
          inquiry_context: JSON.stringify({}),
          matched_at: new Date(Date.now() - 600_000),
          expires_at: new Date(Date.now() - 60_000),
        })
        .returning(["id"]);

      const result = await timeout.processTimeouts(new Date());
      expect(result.rerouted).toBeGreaterThanOrEqual(1);

      const after = await masterKnex("ambassador_inquiries").where({ id: row.id }).first();
      expect(after.ambassador_id).toBe(secondAmbId);
      expect(after.status).toBe("matched");
      expect(new Date(after.expires_at).getTime()).toBeGreaterThan(Date.now());

      // Re-delivering the tick must not reroute again — the window is now open.
      const replay = await timeout.processTimeouts(new Date());
      const stillSecond = await masterKnex("ambassador_inquiries").where({ id: row.id }).first();
      expect(stillSecond.ambassador_id).toBe(secondAmbId);
      expect(replay.rerouted).toBe(0);
    });

    it("escalates when the program has nobody else online", async () => {
      await masterKnex("ambassadors")
        .whereIn("id", [ambId, secondAmbId])
        .update({ is_online: false });

      const [row] = await masterKnex("ambassador_inquiries")
        .insert({
          program_id: programA,
          prospect_id: prospectUser,
          ambassador_id: ambId,
          status: "matched",
          first_message: "hello?",
          inquiry_context: JSON.stringify({}),
          expires_at: new Date(Date.now() - 60_000),
        })
        .returning(["id"]);

      const result = await timeout.processTimeouts(new Date());
      expect(result.escalated).toBeGreaterThanOrEqual(1);

      const after = await masterKnex("ambassador_inquiries").where({ id: row.id }).first();
      expect(after.status).toBe("escalated");
      expect(after.escalated_at).not.toBeNull();
      expect(after.expires_at).toBeNull();

      await masterKnex("ambassadors").where({ id: ambId }).update({ is_online: true });
    });
  });

  // ── Business engagement surface ───────────────────────────────────────────

  describe("business engagement", () => {
    it("lists only this business's inquiries", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/inquiries?limit=100",
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(200);
      const programIds = new Set(res.json().data.map((i: { program_id: number }) => i.program_id));
      expect(programIds.has(programA)).toBe(true);
      expect(programIds.has(programB)).toBe(false);

      const empty = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/inquiries?limit=100",
        headers: auth(bizB.token),
      });
      expect(empty.json().data).toHaveLength(0);
    });

    it("404s when B asks for the transcript of A's inquiry", async () => {
      const mine = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/inquiries?limit=1",
        headers: auth(bizA.token),
      });
      const id = mine.json().data[0].id;

      const asB = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/inquiries/${id}/messages`,
        headers: auth(bizB.token),
      });
      expect(asB.statusCode).toBe(404);

      const asA = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/inquiries/${id}/messages`,
        headers: auth(bizA.token),
      });
      expect(asA.statusCode).toBe(200);
    });

    it("scopes analytics and the roster to the caller's programs", async () => {
      const analytics = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/analytics",
        headers: auth(bizA.token),
      });
      expect(analytics.statusCode).toBe(200);
      expect(analytics.json().total_inquiries).toBeGreaterThan(0);
      expect(analytics.json().active_ambassadors).toBeGreaterThanOrEqual(2);

      const emptyAnalytics = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/analytics",
        headers: auth(bizB.token),
      });
      expect(emptyAnalytics.json().total_inquiries).toBe(0);
      expect(emptyAnalytics.json().ambassadors).toHaveLength(0);

      const roster = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/roster",
        headers: auth(bizA.token),
      });
      expect(roster.json().data.map((a: { id: number }) => a.id)).toContain(ambId);
      // The employer sees balances but never the ambassador's Stripe identity.
      expect(roster.json().data[0]).not.toHaveProperty("stripe_account_id");

      const rosterB = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/roster",
        headers: auth(bizB.token),
      });
      expect(rosterB.json().data).toHaveLength(0);
    });
  });

  // ── Public reads: the PII boundary ────────────────────────────────────────

  describe("public reads", () => {
    it("serves the program by slug with no auth", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v3/ambassadors/programs/${slugA}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Study buddies A");
    });

    it("404s for a program that is not active", async () => {
      const [draft] = await masterKnex("ambassador_programs")
        .insert({
          business_id: bizA.id,
          name: "Draft",
          slug: `draft-${suffix}`,
          status: "draft",
        })
        .returning(["slug"]);
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/ambassadors/programs/${draft.slug}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("serves an active ambassador profile with no auth", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v3/ambassadors/${ambId}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(ambId);
      expect(res.json().institution_name).toContain("Amb a");
      expect(Array.isArray(res.json().reviews)).toBe(true);
      expect(Array.isArray(res.json().certificates)).toBe(true);
    });

    it("NEVER exposes payout details, contact details or internal identity", async () => {
      // Give the row every admin-only value first, so the assertion is about the
      // projection and not about the columns happening to be empty.
      await masterKnex("ambassadors").where({ id: ambId }).update({
        stripe_account_id: `acct_leaktest_${suffix}`,
        stripe_onboarding_complete: true,
        total_earnings_minor: 90_000,
        pending_earnings_minor: 10_000,
        available_earnings_minor: 80_000,
        deactivation_reason: "internal note",
      });

      const res = await app.inject({ method: "GET", url: `/api/v3/ambassadors/${ambId}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();

      for (const forbidden of [
        "user_id",
        "email",
        "phone",
        "stripe_account_id",
        "stripe_onboarding_complete",
        "total_earnings_minor",
        "pending_earnings_minor",
        "available_earnings_minor",
        "deactivation_reason",
        "currency",
      ]) {
        expect(body).not.toHaveProperty(forbidden);
      }
      // Belt and braces: nothing in the serialised payload mentions the account.
      expect(res.body).not.toContain("acct_leaktest");
      expect(res.body).not.toContain("vitest.local");

      await masterKnex("ambassadors")
        .where({ id: ambId })
        .update({ stripe_account_id: null, stripe_onboarding_complete: false });
    });

    it("404s for an inactive ambassador", async () => {
      await masterKnex("ambassadors").where({ id: secondAmbId }).update({ status: "suspended" });
      const res = await app.inject({ method: "GET", url: `/api/v3/ambassadors/${secondAmbId}` });
      expect(res.statusCode).toBe(404);
      await masterKnex("ambassadors").where({ id: secondAmbId }).update({ status: "active" });
    });
  });

  // ── Money ─────────────────────────────────────────────────────────────────

  describe("payouts", () => {
    it("fails closed with 503 when Stripe is not configured, writing nothing", async () => {
      stripe.setStripeClient(null);
      const before = await masterKnex("ambassador_payouts").where({ ambassador_id: ambId });
      const balanceBefore = (await masterKnex("ambassadors").where({ id: ambId }).first())
        .available_earnings_minor;

      // Onboarding must look complete, so the 503 can only come from the transfer.
      await masterKnex("ambassadors").where({ id: ambId }).update({
        stripe_account_id: `acct_failclosed_${suffix}`,
        stripe_onboarding_complete: true,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/payouts",
        headers: auth(ambToken),
        payload: { amount_minor: 2000, idempotency_key: `failclosed-${suffix}` },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error ?? res.json().message).toBeTruthy();

      // The whole transaction rolled back: no payout row, no debit, no withdrawn
      // earnings — so the caller may simply retry with the same key.
      const after = await masterKnex("ambassador_payouts").where({ ambassador_id: ambId });
      expect(after).toHaveLength(before.length);
      const balanceAfter = (await masterKnex("ambassadors").where({ id: ambId }).first())
        .available_earnings_minor;
      expect(balanceAfter).toBe(balanceBefore);
      const withdrawn = await masterKnex("ambassador_earnings").where({
        ambassador_id: ambId,
        status: "withdrawn",
      });
      expect(withdrawn).toHaveLength(0);
    });

    it("fails closed with 503 on Connect account creation too", async () => {
      stripe.setStripeClient(null);
      await masterKnex("ambassadors")
        .where({ id: ambId })
        .update({ stripe_account_id: null, stripe_onboarding_complete: false });

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/connect",
        headers: auth(ambToken),
      });
      expect(res.statusCode).toBe(503);
      const row = await masterKnex("ambassadors").where({ id: ambId }).first();
      expect(row.stripe_account_id).toBeNull();
    });

    it("rejects a withdrawal below V1's $20 minimum before touching the database", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/payouts",
        headers: auth(ambToken),
        payload: { amount_minor: 1999, idempotency_key: `toosmall-${suffix}` },
      });
      expect(res.statusCode).toBe(400);
      expect(await masterKnex("ambassador_payouts").where({ ambassador_id: ambId })).toHaveLength(0);
    });

    it("refuses a payout before Stripe onboarding is complete", async () => {
      stripe.setStripeClient(stub.client as never);
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/payouts",
        headers: auth(ambToken),
        payload: { amount_minor: 2000, idempotency_key: `noonboarding-${suffix}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("creates the Connect account and completes onboarding through the stub", async () => {
      stripe.setStripeClient(stub.client as never);

      const created = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/connect",
        headers: auth(ambToken),
      });
      expect(created.statusCode).toBe(200);
      expect(created.json().created).toBe(true);
      expect(created.json().account_id).toMatch(/^acct_/);

      // Second call is a no-op — the account already exists.
      const again = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/connect",
        headers: auth(ambToken),
      });
      expect(again.json().created).toBe(false);
      expect(again.json().account_id).toBe(created.json().account_id);

      // The stub reports details_submitted, so the link route settles onboarding.
      const link = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/connect/onboarding-link",
        headers: auth(ambToken),
        payload: {},
      });
      expect(link.statusCode).toBe(200);
      expect(link.json().already_complete).toBe(true);
      const row = await masterKnex("ambassadors").where({ id: ambId }).first();
      expect(row.stripe_onboarding_complete).toBe(true);
    });

    it("402s when the available balance cannot cover the request", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/payouts",
        headers: auth(ambToken),
        payload: { amount_minor: 500_000, idempotency_key: `broke-${suffix}` },
      });
      expect(res.statusCode).toBe(402);
      const balance = (await masterKnex("ambassadors").where({ id: ambId }).first())
        .available_earnings_minor;
      expect(balance).toBe(80_000);
    });

    it("pays out, debits the balance and ledgers the earnings in one transaction", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/payouts",
        headers: auth(ambToken),
        payload: { amount_minor: 2000, idempotency_key: `paid-${suffix}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.replayed).toBe(false);
      expect(body.payout.status).toBe("completed");
      expect(body.payout.stripe_transfer_id).toMatch(/^tr_/);

      const amb = await masterKnex("ambassadors").where({ id: ambId }).first();
      expect(amb.available_earnings_minor).toBe(78_000);

      const withdrawn = await masterKnex("ambassador_earnings").where({
        ambassador_id: ambId,
        status: "withdrawn",
      });
      expect(withdrawn.length).toBeGreaterThan(0);
      expect(withdrawn.every((e: { payout_id: number }) => e.payout_id === body.payout.id)).toBe(
        true,
      );
    });

    it("is idempotent — replaying the same key returns the original payout and moves no money", async () => {
      const transfersBefore = stub.transfers.length;
      const balanceBefore = (await masterKnex("ambassadors").where({ id: ambId }).first())
        .available_earnings_minor;

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/payouts",
        headers: auth(ambToken),
        payload: { amount_minor: 2000, idempotency_key: `paid-${suffix}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().replayed).toBe(true);
      expect(res.json().payout.status).toBe("completed");

      expect(stub.transfers.length).toBe(transfersBefore);
      const balanceAfter = (await masterKnex("ambassadors").where({ id: ambId }).first())
        .available_earnings_minor;
      expect(balanceAfter).toBe(balanceBefore);
      const payouts = await masterKnex("ambassador_payouts").where({ ambassador_id: ambId });
      expect(payouts).toHaveLength(1);
    });

    it("passes the idempotency key through to Stripe", () => {
      expect(stub.transfers[0]!.idempotencyKey).toContain(`paid-${suffix}`);
    });

    it("shows the payout and the summary on the earnings read", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/me/ambassador/earnings",
        headers: auth(ambToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().payouts).toHaveLength(1);
      expect(res.json().summary.available_earnings_minor).toBe(78_000);
    });
  });

  // ── Digest ────────────────────────────────────────────────────────────────

  describe("weekly digest (V1 send-ambassador-digest)", () => {
    it("mails a program with activity and skips one without", async () => {
      const sent: { to: string; subject: string; html: string }[] = [];
      const result = await digest.runDigest(async (email) => {
        sent.push(email);
      });

      expect(result.programs_processed).toBeGreaterThanOrEqual(2);
      // Matched on the recipient, not the subject: the test database persists
      // between runs and a previous run's program carries the same name.
      const mine = sent.find((e) => e.to === `amb.a.${suffix}@vitest.local`);
      expect(mine).toBeTruthy();
      expect(mine!.subject).toContain("Study buddies A");
      expect(mine!.html).toContain("new inquir");

      // Program B has no activity at all, so it is skipped rather than mailed.
      expect(sent.find((e) => e.to === `amb.b.${suffix}@vitest.local`)).toBeUndefined();
      expect(result.skipped_no_activity).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Filters, empty shapes and the unmatched path ──────────────────────────
  //
  // These are the conditional branches the happy path never reaches: optional
  // query filters, a program with nobody online, a business with no programs,
  // a business with no contact address, and lookup by id rather than slug.

  describe("filters and edge shapes", () => {
    it("filters the program list by status", async () => {
      const active = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/programs?status=active&limit=100",
        headers: auth(bizA.token),
      });
      expect(active.json().data.every((p: { status: string }) => p.status === "active")).toBe(true);

      const drafts = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/programs?status=draft&limit=100",
        headers: auth(bizA.token),
      });
      expect(drafts.json().data.every((p: { status: string }) => p.status === "draft")).toBe(true);
      expect(drafts.json().data.map((p: { id: number }) => p.id)).not.toContain(programA);
    });

    it("filters inquiries by program and status", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/inquiries?program_id=${programA}&status=resolved&limit=100`,
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.every((i: { status: string }) => i.status === "resolved")).toBe(true);

      // A program id belonging to somebody else narrows to nothing, never leaks.
      const foreign = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/inquiries?program_id=${programB}&limit=100`,
        headers: auth(bizA.token),
      });
      expect(foreign.json().data).toHaveLength(0);
    });

    it("scopes analytics to a single program when asked", async () => {
      const mine = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/analytics?program_id=${programA}`,
        headers: auth(bizA.token),
      });
      expect(mine.json().total_inquiries).toBeGreaterThan(0);

      const foreign = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/analytics?program_id=${programB}`,
        headers: auth(bizA.token),
      });
      expect(foreign.json().total_inquiries).toBe(0);
    });

    it("resolves a public program by numeric id as well as by slug", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v3/ambassadors/programs/${programA}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().slug).toBe(slugA);
    });

    it("404s an unknown ambassador and an unknown program", async () => {
      expect((await app.inject({ method: "GET", url: "/api/v3/ambassadors/99999999" })).statusCode).toBe(404);
      expect(
        (await app.inject({ method: "GET", url: "/api/v3/ambassadors/programs/no-such-slug" }))
          .statusCode,
      ).toBe(404);
    });

    it("leaves an inquiry pending when no ambassador in the program is online", async () => {
      const [quiet] = await masterKnex("ambassador_programs")
        .insert({
          business_id: bizA.id,
          name: `Quiet ${suffix}`,
          slug: `quiet-${suffix}`,
          status: "active",
        })
        .returning(["id"]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/inquiries",
        headers: auth(prospectToken),
        payload: { program_id: quiet.id, first_message: "hello?", inquiry_context: {} },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe("pending");
      expect(res.json().ambassador_id).toBeNull();
      expect(res.json().expires_at).toBeNull();
    });

    it("404s an inquiry against a program that is not active", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/inquiries",
        headers: auth(prospectToken),
        payload: { program_id: 99999999, first_message: "hi", inquiry_context: {} },
      });
      expect(res.statusCode).toBe(404);
    });

    it("404s an application to a program that is not active", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/me/ambassador/applications",
        headers: auth(prospectToken),
        payload: { program_id: 99999999, application_data: {} },
      });
      expect(res.statusCode).toBe(404);
    });

    it("lists a student's own applications with the program and institution joined", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/me/ambassador/applications",
        headers: auth(ambToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].program_name).toBe("Study buddies A");
      expect(res.json().data[0].institution_name).toContain("Amb a");
    });

    it("returns a null note for an application nobody has annotated", async () => {
      const [app2] = await masterKnex("ambassador_applications")
        .insert({ program_id: programA, student_id: prospectUser, application_data: JSON.stringify({}) })
        .returning(["id"]);
      const res = await app.inject({
        method: "GET",
        url: `/api/v3/business/ambassadors/applications/${app2.id}/notes`,
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().note).toBeNull();

      // Reviewing stage-only leaves the decision timestamps alone.
      const staged = await app.inject({
        method: "PATCH",
        url: `/api/v3/business/ambassadors/programs/${programA}/applications/${app2.id}`,
        headers: auth(bizA.token),
        payload: { current_stage: "interview" },
      });
      expect(staged.json().current_stage).toBe("interview");
      expect(staged.json().decided_at).toBeNull();
    });

    it("404s a note or review on an application that does not exist", async () => {
      const missing = await app.inject({
        method: "GET",
        url: "/api/v3/business/ambassadors/applications/99999999/notes",
        headers: auth(bizA.token),
      });
      expect(missing.statusCode).toBe(404);

      const review = await app.inject({
        method: "PATCH",
        url: `/api/v3/business/ambassadors/programs/${programA}/applications/99999999`,
        headers: auth(bizA.token),
        payload: { status: "rejected" },
      });
      expect(review.statusCode).toBe(404);
    });

    it("archives a program on delete rather than dropping its history", async () => {
      const [doomed] = await masterKnex("ambassador_programs")
        .insert({
          business_id: bizA.id,
          name: `Doomed ${suffix}`,
          slug: `doomed-${suffix}`,
          status: "active",
        })
        .returning(["id"]);
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v3/business/ambassadors/programs/${doomed.id}`,
        headers: auth(bizA.token),
      });
      expect(res.json()).toEqual({ deleted: true });
      const row = await masterKnex("ambassador_programs").where({ id: doomed.id }).first();
      expect(row.status).toBe("archived");
      expect(row.deleted_at).not.toBeNull();
    });

    it("409s when a slug rename collides", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v3/business/ambassadors/programs/${programA}`,
        headers: auth(bizA.token),
        payload: { slug: `quiet-${suffix}` },
      });
      expect(res.statusCode).toBe(409);
    });

    it("skips a program whose business has no contact address", async () => {
      const [ownerRow] = await masterKnex("platform_users")
        .insert({
          first_name: "No",
          last_name: "Mail",
          email: uniqueEmail("amb.nomail"),
          account_status: 1,
        })
        .returning(["id"]);
      const [silent] = await masterKnex("businesses")
        .insert({
          owner_id: ownerRow.id,
          subdomain: `amb-silent-${suffix}`,
          business_name: `Amb silent ${suffix}`,
          email: null,
          account_status: 1,
          status: "verified",
        })
        .returning(["id"]);
      const [prog] = await masterKnex("ambassador_programs")
        .insert({
          business_id: silent.id,
          name: `Silent ${suffix}`,
          slug: `silent-${suffix}`,
          status: "active",
        })
        .returning(["id"]);
      // Give it activity, so it is skipped for the address and not for quiet.
      await masterKnex("ambassador_inquiries").insert({
        program_id: prog.id,
        prospect_id: prospectUser,
        status: "pending",
        first_message: "hi",
        inquiry_context: JSON.stringify({}),
      });

      const result = await digest.runDigest(async () => {});
      expect(result.skipped_no_email).toBeGreaterThanOrEqual(1);
    });

    it("keeps the digest run going when one send throws", async () => {
      const result = await digest.runDigest(async () => {
        throw new Error("smtp down");
      });
      expect(result.emails_sent).toBe(0);
      expect(result.programs_processed).toBeGreaterThan(0);
    });
  });

  // ── Admin monitoring ──────────────────────────────────────────────────────

  describe("admin monitoring", () => {
    it("requires an admin token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/monitoring/ambassador-programs",
        headers: auth(bizA.token),
      });
      expect(res.statusCode).toBe(403);
    });

    it("lists programs across every business with their counters", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/monitoring/ambassador-programs?limit=100",
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const rows = res.json().data;
      const a = rows.find((r: { id: number }) => r.id === programA);
      expect(a).toBeTruthy();
      expect(a.business_name).toContain("Amb a");
      expect(a.active_ambassadors).toBeGreaterThanOrEqual(2);
      expect(a.total_inquiries).toBeGreaterThanOrEqual(1);
      expect(rows.find((r: { id: number }) => r.id === programB)).toBeTruthy();
    });

    it("reports platform stats including payouts", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/admin/monitoring/ambassador-programs/stats",
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.programs.total).toBeGreaterThanOrEqual(2);
      expect(body.ambassadors.active).toBeGreaterThanOrEqual(2);
      expect(body.inquiries.total).toBeGreaterThanOrEqual(1);
      expect(body.payouts.paid_minor).toBeGreaterThanOrEqual(2000);
    });
  });
});
