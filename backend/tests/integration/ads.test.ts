// Ads (Wave G5): campaign CRUD, public serving, impression + lead recording,
// admin moderation, the PII leak guard and cross-tenant isolation.
//
// Specs these assertions come from — never from the implementation:
//   * V1 supabase/functions/record-ad-impression, record-ad-lead
//   * V1 src/pages/admin/AdminAds.tsx (approve / reject+reason / force-pause)
//   * V2 apps/core-api/src/routes/ads.ts (route shapes, dedup windows, analytics
//     projection, budget/date eligibility filter)
//
// Everything runs offline: no broker, no Stripe, no outbound anything.
// Fixtures are built per run with a unique suffix so a sibling suite cannot leave
// this one on stale rows.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("ads", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let sign: (claims: Record<string, unknown>) => string;
  let queueService: { publish: (queue: string, payload: unknown) => Promise<void> };

  let suffix = "";
  let adminToken = "";

  interface Biz {
    id: number;
    schema: string;
    ownerId: number;
    token: string;
  }

  let alpha: Biz; // the advertiser under test
  let beta: Biz; // the other tenant — must never see alpha's anything
  let viewer: { id: number; token: string };
  let viewer2: { id: number; token: string };

  const json = (res: { json: () => unknown }) => res.json() as Record<string, never>;

  const get = (url: string, token?: string) =>
    app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const post = (url: string, token?: string, payload?: unknown) =>
    app.inject({
      method: "POST",
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload ?? {},
    });
  const patch = (url: string, token: string, payload: unknown) =>
    app.inject({ method: "PATCH", url, headers: { authorization: `Bearer ${token}` }, payload });
  const put = (url: string, token: string, payload: unknown) =>
    app.inject({ method: "PUT", url, headers: { authorization: `Bearer ${token}` }, payload });
  const del = (url: string, token: string) =>
    app.inject({ method: "DELETE", url, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const adsModule = (await import("../../src/modules/ads/index.js")).default;
    const { publicAdsModule } = await import("../../src/modules/ads/index.js");
    ({ queueService } = await import("../../src/shared/queue/queueService.js"));

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(adsModule);
    });
    await app.register(publicAdsModule);
    await app.ready();

    suffix = `${process.pid}${Date.now() % 1_000_000}`;
    sign = (claims) => jwt.sign({ email: "ads@vitest.local", ...claims }, config.JWT_SECRET as string);
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });

    const makeUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Ads",
          last_name: label,
          email: uniqueEmail(`ads.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return {
        id: Number(row.id),
        token: sign({ sub: String(row.id), type: "platform_user" }),
      };
    };

    const makeBusiness = async (label: string): Promise<Biz> => {
      const owner = await makeUser(`owner.${label}`);
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: owner.id,
          subdomain: `ads-${label}-${suffix}`,
          business_name: `Ads ${label} ${suffix}`,
          email: uniqueEmail(`ads.biz.${label}`),
          account_status: 1,
          status: "verified",
        })
        .returning(["id", "schema_name"]);
      return {
        id: Number(row.id),
        schema: row.schema_name,
        ownerId: owner.id,
        token: sign({ sub: String(owner.id), type: "platform_user", orgId: row.schema_name }),
      };
    };

    alpha = await makeBusiness("alpha");
    beta = await makeBusiness("beta");
    viewer = await makeUser("viewer");
    viewer2 = await makeUser("viewer2");
  });

  afterAll(async () => {
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── fixture helpers ───────────────────────────────────────────────────────

  let placementSeq = 0;
  /** A placement string unique to this call, so tests never share a serve slot. */
  const newPlacement = () => `feed_top_${suffix}_${++placementSeq}`;

  interface Campaign {
    id: number;
    placement: string;
    creativeId: number;
  }

  async function makeCampaign(
    biz: Biz,
    overrides: Record<string, unknown> = {},
    placement = newPlacement(),
  ): Promise<Campaign> {
    const created = json(
      await post(`/api/v3/business/ads/campaigns`, biz.token, {
        name: `Campaign ${placement}`,
        objective: "leads",
        budget_type: "lifetime",
        budget_amount: 1000,
        cost_model: "cpv",
        cost_per_unit: 2,
        ...overrides,
      }),
    ) as unknown as { id: number };
    const campaignId = created.id;

    const creative = json(
      await post(`/api/v3/business/ads/campaigns/${campaignId}/creatives`, biz.token, {
        media_url: "https://cdn.example.com/ad.png",
        headline: "Study abroad",
        cta_url: "https://example.com/apply",
      }),
    ) as unknown as { id: number };

    await put(`/api/v3/business/ads/campaigns/${campaignId}/placements`, biz.token, {
      placements: [placement],
    });
    // Only an admin may make a campaign live — the same rule V1's AdminAds page enforced.
    await post(`/api/v3/admin/marketing/ads/${campaignId}/approve`, adminToken);
    return { id: campaignId, placement, creativeId: creative.id };
  }

  const fundWallet = async (businessId: number, amount: number) => {
    const credits = await import("../../src/modules/billing/services/credits.service.js");
    await credits.grantCredits({
      businessId,
      amount,
      transactionType: "manual_adjustment",
      bucket: "purchased",
      description: "test top-up",
    });
  };
  const balanceOf = async (businessId: number) =>
    (await import("../../src/modules/billing/services/credits.service.js"))
      .getBalance(businessId)
      .then((b) => b.balance);

  const campaignRow = (id: number) => masterKnex("ad_campaigns").where({ id }).first();

  // ── campaign CRUD (V2 owner-scoped contract) ──────────────────────────────

  describe("campaign management", () => {
    it("creates a campaign as draft owned by the caller's business", async () => {
      const res = await post("/api/v3/business/ads/campaigns", alpha.token, {
        name: `Draft ${suffix}`,
        objective: "awareness",
        budget_amount: 500,
        cost_per_unit: 3,
      });
      expect(res.statusCode).toBe(201);
      const body = json(res) as unknown as Record<string, unknown>;
      // V1's advertiser could not self-approve: a new campaign starts as draft.
      expect(body.status).toBe("draft");
      expect(body.business_id).toBe(alpha.id);
      expect(body.created_by).toBe(alpha.ownerId);
      // numeric(12,2) is returned as a number, not the string V2 leaked out of
      // drizzle — the frontend renders it into an amount, not a label.
      expect(body.budget_amount).toBe(500);
      expect(body.cost_per_unit).toBe(3);
      expect(body.impressions_count).toBe(0);
    });

    it("rejects a javascript: creative URL (stored XSS via cta_url)", async () => {
      const created = json(
        await post("/api/v3/business/ads/campaigns", alpha.token, { name: `XSS ${suffix}` }),
      ) as unknown as { id: number };

      for (const bad of [
        "javascript:alert(1)",
        "data:text/html;base64,PHNjcmlwdD4=",
        "vbscript:msgbox(1)",
      ]) {
        const res = await post(`/api/v3/business/ads/campaigns/${created.id}/creatives`, alpha.token, {
          media_url: "https://cdn.example.com/a.png",
          cta_url: bad,
        });
        expect(res.statusCode, `cta_url=${bad}`).toBe(400);
      }
      // …and the same guard on media_url, which lands in an <img src>.
      expect(
        (
          await post(`/api/v3/business/ads/campaigns/${created.id}/creatives`, alpha.token, {
            media_url: "javascript:alert(1)",
          })
        ).statusCode,
      ).toBe(400);
    });

    it("replaces the full placement set on PUT, like V1's useSavePlacements", async () => {
      const created = json(
        await post("/api/v3/business/ads/campaigns", alpha.token, { name: `Places ${suffix}` }),
      ) as unknown as { id: number };
      const a = newPlacement();
      const b = newPlacement();

      await put(`/api/v3/business/ads/campaigns/${created.id}/placements`, alpha.token, {
        placements: [a, b],
      });
      let list = json(await get(`/api/v3/business/ads/campaigns/${created.id}/placements`, alpha.token));
      expect((list as unknown as { placement: string }[]).map((p) => p.placement).sort()).toEqual([a, b].sort());

      await put(`/api/v3/business/ads/campaigns/${created.id}/placements`, alpha.token, { placements: [b] });
      list = json(await get(`/api/v3/business/ads/campaigns/${created.id}/placements`, alpha.token));
      expect((list as unknown as { placement: string }[]).map((p) => p.placement)).toEqual([b]);
    });

    it("refuses to let an advertiser set its own status to active", async () => {
      const created = json(
        await post("/api/v3/business/ads/campaigns", alpha.token, { name: `Self ${suffix}` }),
      ) as unknown as { id: number };

      const res = await patch(`/api/v3/business/ads/campaigns/${created.id}`, alpha.token, {
        status: "active",
      });
      expect(res.statusCode).toBe(400);
      expect((await campaignRow(created.id)).status).toBe("draft");

      // pausing and submitting for review are the advertiser's own verbs
      expect(
        (await patch(`/api/v3/business/ads/campaigns/${created.id}`, alpha.token, { status: "pending_review" }))
          .statusCode,
      ).toBe(200);
    });

    it("soft-deletes a creative rather than dropping the row its impressions point at", async () => {
      const c = await makeCampaign(alpha);
      expect((await del(`/api/v3/business/ads/creatives/${c.creativeId}`, alpha.token)).statusCode).toBe(204);
      const row = await masterKnex("ad_creatives").where({ id: c.creativeId }).first();
      expect(row).toBeTruthy();
      expect(row.deleted_at).not.toBeNull();
    });
  });

  // ── public serving ────────────────────────────────────────────────────────

  describe("serving", () => {
    it("serves an approved campaign's creative to an anonymous caller", async () => {
      const c = await makeCampaign(alpha);
      const res = await get(`/api/v3/ads/placements/${c.placement}`);
      expect(res.statusCode).toBe(200);
      const ads = (json(res) as unknown as { ads: Record<string, unknown>[] }).ads;
      expect(ads).toHaveLength(1);
      expect((ads[0].campaign as { id: number }).id).toBe(c.id);
      expect(ads[0].business_name).toContain("Ads alpha");
    });

    it("never serves a draft, rejected, paused or out-of-window campaign", async () => {
      const draft = newPlacement();
      const created = json(
        await post("/api/v3/business/ads/campaigns", alpha.token, { name: `Hidden ${suffix}` }),
      ) as unknown as { id: number };
      await put(`/api/v3/business/ads/campaigns/${created.id}/placements`, alpha.token, {
        placements: [draft],
      });
      await post(`/api/v3/business/ads/campaigns/${created.id}/creatives`, alpha.token, {
        media_url: "https://cdn.example.com/a.png",
      });
      expect((json(await get(`/api/v3/ads/placements/${draft}`)) as unknown as { ads: [] }).ads).toHaveLength(0);

      // approved, then force-paused by an admin
      const paused = await makeCampaign(alpha);
      await post(`/api/v3/admin/marketing/ads/${paused.id}/pause`, adminToken);
      expect(
        (json(await get(`/api/v3/ads/placements/${paused.placement}`)) as unknown as { ads: [] }).ads,
      ).toHaveLength(0);

      // approved but its window has closed (V2's starts_at/ends_at filter)
      const expired = await makeCampaign(alpha);
      await masterKnex("ad_campaigns")
        .where({ id: expired.id })
        .update({ ends_at: new Date(Date.now() - 60_000) });
      expect(
        (json(await get(`/api/v3/ads/placements/${expired.placement}`)) as unknown as { ads: [] }).ads,
      ).toHaveLength(0);
    });

    it("stops serving once spend reaches budget (V2's budget filter)", async () => {
      const c = await makeCampaign(alpha, { budget_amount: 10, cost_per_unit: 4 });
      await masterKnex("ad_campaigns").where({ id: c.id }).update({ spent_amount: 10 });
      expect((json(await get(`/api/v3/ads/placements/${c.placement}`)) as unknown as { ads: [] }).ads).toHaveLength(0);
    });

    it("hides a campaign the signed-in viewer dismissed", async () => {
      const c = await makeCampaign(alpha);
      expect((json(await get(`/api/v3/ads/placements/${c.placement}`, viewer.token)) as unknown as { ads: [] }).ads)
        .toHaveLength(1);

      expect((await post("/api/v3/ads/dismissals", viewer.token, { campaign_id: c.id })).statusCode).toBe(200);
      expect((json(await get(`/api/v3/ads/placements/${c.placement}`, viewer.token)) as unknown as { ads: [] }).ads)
        .toHaveLength(0);
      // …but not from anyone else.
      expect((json(await get(`/api/v3/ads/placements/${c.placement}`, viewer2.token)) as unknown as { ads: [] }).ads)
        .toHaveLength(1);

      // Idempotent: V1 left the unique violation unhandled on a repeat dismiss.
      expect((await post("/api/v3/ads/dismissals", viewer.token, { campaign_id: c.id })).statusCode).toBe(200);
    });

    it("NEVER returns viewer or lead PII to an anonymous caller (leak guard)", async () => {
      const c = await makeCampaign(alpha);
      await fundWallet(alpha.id, 10_000);
      await post("/api/v3/ads/impressions", viewer.token, { campaign_id: c.id, placement: c.placement });
      await post("/api/v3/ads/leads", viewer.token, {
        campaign_id: c.id,
        placement: c.placement,
        lead_type: "enquiry",
      });

      const res = await get(`/api/v3/ads/placements/${c.placement}`);
      const body = res.payload;

      // Two assertions, because a substring scan alone is not enough: a numeric id
      // like "4" appears by coincidence in any payload. Field NAMES are scanned as
      // substrings; then the actual key set is walked, which is what catches a
      // future `select *` regardless of what the column ends up being called.
      for (const forbidden of [
        "viewer_user_id",
        "viewer_fingerprint",
        "reporter_user_id",
        "spent_amount",
        "budget_amount",
        "created_by",
        "rejection_reason",
        "impressions_count",
        "leads_count",
        "cost_per_unit",
      ]) {
        expect(body, `leaked ${forbidden}`).not.toContain(forbidden);
      }

      const keys = new Set<string>();
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === "object") {
          for (const [k, v] of Object.entries(node)) {
            keys.add(k);
            walk(v);
          }
        }
      };
      walk(res.json());
      // An exhaustive whitelist: anything new in the anonymous projection has to be
      // added here deliberately, which is the point.
      expect([...keys].sort()).toEqual(
        [
          "ads",
          "business_logo",
          "business_name",
          "campaign",
          "cost_model",
          "creative",
          "cta_text",
          "cta_url",
          "description",
          "headline",
          "id",
          "media_type",
          "media_url",
          "objective",
          "placement",
          "thumbnail_url",
          "business_id",
          "name",
        ].sort(),
      );
      // The viewer's own id must not appear as a value anywhere in the tree.
      const values: unknown[] = [];
      const collect = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(collect);
        if (node && typeof node === "object") return Object.values(node).forEach(collect);
        values.push(node);
      };
      collect(res.json());
      expect(values.filter((v) => v === viewer.id)).toHaveLength(0);
    });
  });

  // ── impressions: the counter and the dedup (the concurrency-critical path) ─

  describe("impression recording", () => {
    it("increments the campaign counter atomically and charges CPV spend", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpv", cost_per_unit: 2, budget_amount: 1000 });
      const res = await post("/api/v3/ads/impressions", viewer.token, {
        campaign_id: c.id,
        placement: c.placement,
        creative_id: c.creativeId,
      });
      expect(res.statusCode).toBe(200);
      expect(json(res)).toMatchObject({ ok: true });

      const row = await campaignRow(c.id);
      expect(row.impressions_count).toBe(1);
      expect(Number(row.spent_amount)).toBe(2);

      const impressions = await masterKnex("ad_impressions").where({ campaign_id: c.id });
      expect(impressions).toHaveLength(1);
      expect(Number(impressions[0].cost_charged)).toBe(2);
    });

    it("dedups the same viewer within the hour, without charging twice", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpv", cost_per_unit: 2 });
      await post("/api/v3/ads/impressions", viewer.token, { campaign_id: c.id, placement: c.placement });
      const second = await post("/api/v3/ads/impressions", viewer.token, {
        campaign_id: c.id,
        placement: c.placement,
      });
      expect(json(second)).toMatchObject({ ok: true, deduplicated: true });

      const row = await campaignRow(c.id);
      expect(row.impressions_count).toBe(1);
      expect(Number(row.spent_amount)).toBe(2);
      expect(await masterKnex("ad_impressions").where({ campaign_id: c.id })).toHaveLength(1);
    });

    it("charges once when the SAME viewer's impressions land concurrently (D-G5-2)", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpv", cost_per_unit: 5 });
      const payload = { campaign_id: c.id, placement: c.placement };

      // V1/V2 count-then-insert: all four pass the count and all four charge.
      const results = await Promise.all([
        post("/api/v3/ads/impressions", viewer.token, payload),
        post("/api/v3/ads/impressions", viewer.token, payload),
        post("/api/v3/ads/impressions", viewer.token, payload),
        post("/api/v3/ads/impressions", viewer.token, payload),
      ]);
      for (const r of results) expect(r.statusCode).toBe(200);

      // The database is the assertion, not the response bodies.
      expect(await masterKnex("ad_impressions").where({ campaign_id: c.id })).toHaveLength(1);
      const row = await campaignRow(c.id);
      expect(row.impressions_count).toBe(1);
      expect(Number(row.spent_amount)).toBe(5);
    });

    it("counts distinct viewers separately", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpl" });
      await post("/api/v3/ads/impressions", viewer.token, { campaign_id: c.id, placement: c.placement });
      await post("/api/v3/ads/impressions", viewer2.token, { campaign_id: c.id, placement: c.placement });
      expect((await campaignRow(c.id)).impressions_count).toBe(2);
      // A cpl campaign charges per lead, not per view — nothing is spent here.
      expect(Number((await campaignRow(c.id)).spent_amount)).toBe(0);
    });

    it("reports budget_exhausted and writes nothing once CPV spend would exceed budget", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpv", cost_per_unit: 8, budget_amount: 8 });
      await post("/api/v3/ads/impressions", viewer.token, { campaign_id: c.id, placement: c.placement });
      expect(Number((await campaignRow(c.id)).spent_amount)).toBe(8);

      const res = await post("/api/v3/ads/impressions", viewer2.token, {
        campaign_id: c.id,
        placement: c.placement,
      });
      expect(json(res)).toMatchObject({ ok: false, budget_exhausted: true });
      // No impression row, no counter movement, no overspend.
      expect(await masterKnex("ad_impressions").where({ campaign_id: c.id })).toHaveLength(1);
      const row = await campaignRow(c.id);
      expect(row.impressions_count).toBe(1);
      expect(Number(row.spent_amount)).toBe(8);
    });

    it("bills 50 credits on the 1,000th impression, exactly once (D-G5-1)", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpl" });
      await fundWallet(alpha.id, 10_000);
      const before = await balanceOf(alpha.id);

      // Fast-forward the counter to one short of the block boundary. This is the
      // state V1 read with a count(*) on every single request.
      await masterKnex("ad_campaigns").where({ id: c.id }).update({ impressions_count: 999 });

      await post("/api/v3/ads/impressions", viewer.token, { campaign_id: c.id, placement: c.placement });
      expect((await campaignRow(c.id)).impressions_count).toBe(1000);
      expect((await campaignRow(c.id)).billed_impression_blocks).toBe(1);
      expect(await balanceOf(alpha.id)).toBe(before - 50);

      const debits = await masterKnex("credit_transactions")
        .where({ transaction_type: "ad_spend", reference_type: "ad_campaign", reference_id: String(c.id) })
        .select("amount", "idempotency_key");
      expect(debits).toHaveLength(1);
      expect(debits[0].amount).toBe(-50);
      expect(debits[0].idempotency_key).toBe(`ad_impression_block:${c.id}:1`);

      // The 1,001st does not bill again.
      await post("/api/v3/ads/impressions", viewer2.token, { campaign_id: c.id, placement: c.placement });
      expect(await balanceOf(alpha.id)).toBe(before - 50);
    });

    it("pauses the campaign and notifies the owner when credits run short at a block boundary", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpl" });
      // Drain the wallet so the 50-credit block charge cannot be covered.
      const balance = await balanceOf(alpha.id);
      if (balance > 0) {
        const credits = await import("../../src/modules/billing/services/credits.service.js");
        await credits.spendCredits(
          alpha.id,
          { amount: balance, transaction_type: "manual_adjustment", description: "drain" },
          null,
        );
      }
      await masterKnex("ad_campaigns").where({ id: c.id }).update({ impressions_count: 999 });

      // The broker is unreachable in this suite (LAVINMQ_URL is pinned to a dead
      // port), and publish() swallows that by design, so the spy is the only place
      // the fan-out is observable.
      const spy = vi.spyOn(queueService, "publish");
      const res = await post("/api/v3/ads/impressions", viewer.token, {
        campaign_id: c.id,
        placement: c.placement,
      });
      // The impression itself still counts — V1 recorded it too. What changes is
      // that the campaign stops serving.
      expect(res.statusCode).toBe(200);
      const row = await campaignRow(c.id);
      expect(row.impressions_count).toBe(1000);
      expect(row.status).toBe("paused");
      // Not billed, so the block is not marked billed and a top-up can retry it.
      expect(row.billed_impression_blocks).toBe(0);

      const published = spy.mock.calls.map(([, payload]) => payload as Record<string, unknown>);
      const note = published.find((p) => p.reference_id === String(c.id));
      expect(note).toBeTruthy();
      expect(note!.platform_user_ids).toEqual([alpha.ownerId]);
      expect(note!.reference_type).toBe("ad_campaign");
      spy.mockRestore();
    });

    // Regression guard for the fail-open the security review caught: a bare
    // `catch {}` around the block settlement read EVERY failure as "out of
    // credits", so a deadlock or a bug inside spendCredits silently lost the
    // revenue AND paused the advertiser for a reason that was never true.
    // Only a 402 may pause; anything else is a real fault and must propagate.
    it("propagates a non-402 settle failure instead of pausing the campaign", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpl" });
      await fundWallet(alpha.id, 10_000);
      const before = await balanceOf(alpha.id);
      await masterKnex("ad_campaigns").where({ id: c.id }).update({ impressions_count: 999 });

      const creditsModule = await import("../../src/modules/billing/services/credits.service.js");
      const spy = vi
        .spyOn(creditsModule, "spendCredits")
        .mockRejectedValue(new Error("deadlock detected"));

      const res = await post("/api/v3/ads/impressions", viewer.token, {
        campaign_id: c.id,
        placement: c.placement,
      });
      // The fault surfaces as a 500 rather than a quiet success.
      expect(res.statusCode).toBe(500);

      const row = await campaignRow(c.id);
      // NOT paused: an infrastructure fault is not an empty wallet.
      expect(row.status).toBe("active");
      // And the block is not marked billed, so a retry can still settle it.
      expect(row.billed_impression_blocks).toBe(0);
      // The wallet was never touched.
      expect(await balanceOf(alpha.id)).toBe(before);

      spy.mockRestore();
    });

    it("404s an unknown or inactive campaign and requires a signed-in viewer", async () => {
      const c = await makeCampaign(alpha);
      expect(
        (await post("/api/v3/ads/impressions", viewer.token, { campaign_id: 99_999_999, placement: c.placement }))
          .statusCode,
      ).toBe(404);
      // Anonymous impressions are how V1's budget-drain abuse worked.
      expect(
        (await post("/api/v3/ads/impressions", undefined, { campaign_id: c.id, placement: c.placement }))
          .statusCode,
      ).toBe(401);
    });
  });

  // ── leads ─────────────────────────────────────────────────────────────────

  describe("lead capture", () => {
    it("records a lead, charges CPL, and dedups per user+type per day", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpl", cost_per_unit: 7, budget_amount: 1000 });
      const body = { campaign_id: c.id, placement: c.placement, lead_type: "enquiry" as const };

      expect(json(await post("/api/v3/ads/leads", viewer.token, body))).toMatchObject({ ok: true });
      expect(json(await post("/api/v3/ads/leads", viewer.token, body))).toMatchObject({
        ok: true,
        deduplicated: true,
      });

      const leads = await masterKnex("ad_leads").where({ campaign_id: c.id });
      expect(leads).toHaveLength(1);
      expect(Number(leads[0].cost_charged)).toBe(7);
      const row = await campaignRow(c.id);
      expect(row.leads_count).toBe(1);
      expect(Number(row.spent_amount)).toBe(7);

      // A different lead_type from the same user is a different lead.
      expect(
        json(await post("/api/v3/ads/leads", viewer.token, { ...body, lead_type: "click" })),
      ).toMatchObject({ ok: true });
      expect((await campaignRow(c.id)).leads_count).toBe(2);
    });

    it("charges once when the same lead lands concurrently", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpl", cost_per_unit: 3, budget_amount: 1000 });
      const body = { campaign_id: c.id, placement: c.placement, lead_type: "rsvp" as const };
      await Promise.all([
        post("/api/v3/ads/leads", viewer.token, body),
        post("/api/v3/ads/leads", viewer.token, body),
        post("/api/v3/ads/leads", viewer.token, body),
      ]);
      expect(await masterKnex("ad_leads").where({ campaign_id: c.id })).toHaveLength(1);
      expect(Number((await campaignRow(c.id)).spent_amount)).toBe(3);
    });

    it("validates lead_type at the boundary", async () => {
      const c = await makeCampaign(alpha);
      for (const bad of ["purchase", "", "CLICK", "'; drop table ad_leads; --"]) {
        const res = await post("/api/v3/ads/leads", viewer.token, {
          campaign_id: c.id,
          placement: c.placement,
          lead_type: bad,
        });
        expect(res.statusCode, `lead_type=${bad}`).toBe(400);
      }
      expect(
        (await post("/api/v3/ads/leads", viewer.token, { campaign_id: c.id, lead_type: "click" })).statusCode,
      ).toBe(400);
    });
  });

  // ── analytics: V2's projection, and what it must not carry ────────────────

  describe("analytics", () => {
    it("returns the raw per-creative rows V2's editor slices, with no viewer identity", async () => {
      const c = await makeCampaign(alpha, { cost_model: "cpl" });
      await post("/api/v3/ads/impressions", viewer.token, {
        campaign_id: c.id,
        placement: c.placement,
        creative_id: c.creativeId,
      });
      await post("/api/v3/ads/impressions", viewer2.token, {
        campaign_id: c.id,
        placement: c.placement,
        creative_id: c.creativeId,
      });
      await post("/api/v3/ads/leads", viewer.token, {
        campaign_id: c.id,
        placement: c.placement,
        lead_type: "enquiry",
      });

      const res = await get(`/api/v3/business/ads/campaigns/${c.id}/analytics`, alpha.token);
      expect(res.statusCode).toBe(200);
      const a = json(res) as unknown as {
        total_impressions: number;
        total_leads: number;
        ctr: string;
        impressions: Record<string, unknown>[];
        leads: Record<string, unknown>[];
      };
      expect(a.total_impressions).toBe(2);
      expect(a.total_leads).toBe(1);
      expect(a.ctr).toBe("0.00");
      expect(a.impressions).toHaveLength(2);
      expect(Object.keys(a.impressions[0]).sort()).toEqual(
        ["creative_id", "id", "is_click", "placement", "viewed_at"].sort(),
      );
      expect(Object.keys(a.leads[0]).sort()).toEqual(
        ["created_at", "creative_id", "id", "lead_type"].sort(),
      );
      // The whole point of the explicit projection.
      expect(res.payload).not.toContain("viewer_user_id");
      expect(res.payload).not.toContain("user_id");
      expect(res.payload).not.toContain("viewer_fingerprint");
    });
  });

  // ── admin moderation (V1 AdminAds.tsx) ────────────────────────────────────

  describe("admin moderation", () => {
    it("approves, force-pauses, and requires a reason to reject", async () => {
      const created = json(
        await post("/api/v3/business/ads/campaigns", alpha.token, { name: `Mod ${suffix}` }),
      ) as unknown as { id: number };

      expect((await post(`/api/v3/admin/marketing/ads/${created.id}/approve`, adminToken)).statusCode).toBe(200);
      let row = await campaignRow(created.id);
      expect(row.status).toBe("active");
      expect(row.reviewed_by).toBe(1);
      expect(row.reviewed_at).not.toBeNull();

      expect((await post(`/api/v3/admin/marketing/ads/${created.id}/pause`, adminToken)).statusCode).toBe(200);
      expect((await campaignRow(created.id)).status).toBe("paused");

      // A rejection with no reason leaves the advertiser guessing — refused.
      expect((await post(`/api/v3/admin/marketing/ads/${created.id}/reject`, adminToken, {})).statusCode).toBe(400);
      expect(
        (await post(`/api/v3/admin/marketing/ads/${created.id}/reject`, adminToken, { reason: "Misleading claim" }))
          .statusCode,
      ).toBe(200);
      row = await campaignRow(created.id);
      expect(row.status).toBe("rejected");
      expect(row.rejection_reason).toBe("Misleading claim");
    });

    it("lists campaigns across businesses with counts, filtered by status", async () => {
      const mine = await makeCampaign(alpha);
      const theirs = await makeCampaign(beta);

      const list = json(await get("/api/v3/admin/marketing/ads?status=active&limit=100", adminToken)) as unknown as {
        data: { id: number; business_name: string }[];
      };
      const ids = list.data.map((r) => r.id);
      expect(ids).toContain(mine.id);
      expect(ids).toContain(theirs.id);
      expect(list.data.find((r) => r.id === mine.id)!.business_name).toContain("Ads alpha");

      const stats = json(await get("/api/v3/admin/marketing/ads/stats", adminToken)) as unknown as {
        active: number;
        pending_review: number;
        pending_reports: number;
      };
      expect(stats.active).toBeGreaterThanOrEqual(2);
      expect(typeof stats.pending_review).toBe("number");
      expect(typeof stats.pending_reports).toBe("number");
    });

    it("surfaces reports to admins only, and caps one open report per reporter", async () => {
      const c = await makeCampaign(alpha);
      expect(
        (await post("/api/v3/ads/reports", viewer.token, { campaign_id: c.id, reason: "misleading", details: "x" }))
          .statusCode,
      ).toBe(201);
      // A second report from the same person is the same complaint.
      expect(
        (await post("/api/v3/ads/reports", viewer.token, { campaign_id: c.id, reason: "spam" })).statusCode,
      ).toBe(200);
      expect(await masterKnex("ad_reports").where({ campaign_id: c.id })).toHaveLength(1);

      const reports = json(await get("/api/v3/admin/marketing/ads/reports?limit=100", adminToken)) as unknown as {
        data: { campaign_id: number }[];
      };
      expect(reports.data.map((r) => r.campaign_id)).toContain(c.id);

      // The advertiser cannot read who reported it.
      expect((await get("/api/v3/admin/marketing/ads/reports", alpha.token)).statusCode).toBe(403);
    });
  });

  // ── isolation ─────────────────────────────────────────────────────────────

  describe("cross-tenant isolation", () => {
    it("hides and refuses another business's campaign on every owner route", async () => {
      const mine = await makeCampaign(alpha);

      // 404, not 403 — a 403 confirms the id exists.
      expect((await get(`/api/v3/business/ads/campaigns/${mine.id}`, beta.token)).statusCode).toBe(404);
      expect((await patch(`/api/v3/business/ads/campaigns/${mine.id}`, beta.token, { name: "hijack" })).statusCode)
        .toBe(404);
      expect((await get(`/api/v3/business/ads/campaigns/${mine.id}/analytics`, beta.token)).statusCode).toBe(404);
      expect((await get(`/api/v3/business/ads/campaigns/${mine.id}/creatives`, beta.token)).statusCode).toBe(404);
      expect(
        (await post(`/api/v3/business/ads/campaigns/${mine.id}/creatives`, beta.token, {
          media_url: "https://cdn.example.com/x.png",
        })).statusCode,
      ).toBe(404);
      expect((await put(`/api/v3/business/ads/campaigns/${mine.id}/placements`, beta.token, { placements: [] }))
        .statusCode).toBe(404);
      expect((await del(`/api/v3/business/ads/creatives/${mine.creativeId}`, beta.token)).statusCode).toBe(404);

      // Nothing was mutated by any of that.
      expect((await campaignRow(mine.id)).name).toBe(`Campaign ${mine.placement}`);
      expect((await masterKnex("ad_creatives").where({ id: mine.creativeId }).first()).deleted_at).toBeNull();

      // And beta's list never contains it.
      const list = json(await get("/api/v3/business/ads/campaigns?limit=100", beta.token)) as unknown as {
        data: { id: number }[];
      };
      expect(list.data.map((r) => r.id)).not.toContain(mine.id);
    });

    it("refuses owner routes without a business context, and admin routes for non-admins", async () => {
      const mine = await makeCampaign(alpha);
      expect((await get("/api/v3/business/ads/campaigns", viewer.token)).statusCode).toBe(403);
      expect((await get(`/api/v3/business/ads/campaigns/${mine.id}`, viewer.token)).statusCode).toBe(403);
      expect((await post("/api/v3/business/ads/campaigns", viewer.token, { name: "x" })).statusCode).toBe(403);

      expect((await get("/api/v3/admin/marketing/ads", viewer.token)).statusCode).toBe(403);
      expect((await get("/api/v3/admin/marketing/ads", alpha.token)).statusCode).toBe(403);
      expect((await post(`/api/v3/admin/marketing/ads/${mine.id}/approve`, alpha.token)).statusCode).toBe(403);
      expect((await campaignRow(mine.id)).status).toBe("active");
    });

    it("rejects an unauthenticated call on every non-serving route", async () => {
      for (const url of [
        "/api/v3/business/ads/campaigns",
        "/api/v3/admin/marketing/ads",
        "/api/v3/admin/marketing/ads/stats",
      ]) {
        expect((await get(url)).statusCode, url).toBe(401);
      }
      for (const url of ["/api/v3/ads/impressions", "/api/v3/ads/leads", "/api/v3/ads/dismissals", "/api/v3/ads/reports"]) {
        expect((await post(url)).statusCode, url).toBe(401);
      }
    });
  });
});
