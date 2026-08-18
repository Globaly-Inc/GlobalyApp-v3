// FX rates cache (G7, §3.6) — the whole decision table, plus exact storage.
//
// SPEC SOURCE: V2's apps/core-api/src/routes/fx-rates.ts, read line by line. Its
// contract is that a STALE CACHED RATE IS ALWAYS PREFERRED TO FAILING — a slightly
// stale rate beats a broken price — and that 503 happens only when there is no
// snapshot to fall back to. Both halves are asserted below, because either one
// missing is a bug: fail-open would invent prices, fail-closed-always would break
// the search page on every provider hiccup.
//
// No network, no FX credential. The provider is injected.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

type ProviderModule = typeof import("../../src/modules/fx/services/provider.js");

const BASE = "AUD";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

describeDb("fx rates cache", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let provider: ProviderModule;

  beforeAll(async () => {
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    provider = await import("../../src/modules/fx/services/provider.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const fxModule = (await import("../../src/modules/fx/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(fxModule);
    await app.ready();
  });

  afterEach(async () => {
    provider.setFxProvider(null);
    await masterKnex("fx_rate_cache").del();
  });

  afterAll(async () => {
    provider?.setFxProvider(null);
    if (masterKnex) await masterKnex("fx_rate_cache").del();
    await app?.close();
    await shutdownPools?.();
  });

  const get = () => app.inject({ method: "GET", url: "/api/v3/fx-rates" });

  /** Seed a snapshot `ageMs` old. */
  async function seedSnapshot(rates: Record<string, string>, ageMs = 0) {
    const fetchedAt = new Date(Date.now() - ageMs);
    await masterKnex("fx_rate_cache").insert(
      Object.entries(rates).map(([quote, rate]) => ({
        base_currency: BASE,
        quote_currency: quote,
        rate,
        fetched_at: fetchedAt,
      })),
    );
    return fetchedAt;
  }

  // ── FAIL CLOSED ────────────────────────────────────────────────────────────

  it("503s with no cache and no provider — never a fabricated rate", async () => {
    const res = await get();
    expect(res.statusCode).toBe(503);
    expect(res.json().rates).toBeUndefined();
  });

  it("503s with no cache when the provider throws", async () => {
    provider.setFxProvider({
      async fetchRates() {
        throw new Error("upstream down");
      },
    });
    const res = await get();
    expect(res.statusCode).toBe(503);
  });

  it("503s with no cache when the provider returns nothing usable", async () => {
    provider.setFxProvider({ async fetchRates() { return {}; } });
    expect((await get()).statusCode).toBe(503);
  });

  // ── STALE-IN-PREFERENCE-TO-FAILING (V2's contract) ────────────────────────

  it("serves a STALE snapshot rather than failing when the provider is absent", async () => {
    await seedSnapshot({ USD: "0.6500000000" }, SIX_HOURS_MS + 60_000);

    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().stale).toBe(true);
    expect(res.json().rates.USD).toBe(0.65);
  });

  it("serves a STALE snapshot rather than failing when the provider throws", async () => {
    await seedSnapshot({ USD: "0.6500000000" }, SIX_HOURS_MS + 60_000);
    provider.setFxProvider({
      async fetchRates() {
        throw new Error("upstream down");
      },
    });

    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().stale).toBe(true);
    expect(res.json().rates.USD).toBe(0.65);
  });

  it("does not overwrite the cache with a failed refresh", async () => {
    await seedSnapshot({ USD: "0.6500000000" }, SIX_HOURS_MS + 60_000);
    provider.setFxProvider({
      async fetchRates() {
        throw new Error("upstream down");
      },
    });
    await get();

    const rows = await masterKnex("fx_rate_cache").select("rate");
    expect(rows).toHaveLength(1);
    expect(String(rows[0].rate)).toBe("0.6500000000");
  });

  // ── FRESH / REFRESH ───────────────────────────────────────────────────────

  it("serves a fresh snapshot without calling the provider", async () => {
    await seedSnapshot({ USD: "0.6500000000", GBP: "0.5100000000" }, 60_000);
    let called = false;
    provider.setFxProvider({
      async fetchRates() {
        called = true;
        return { USD: "9.9999999999" };
      },
    });

    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().stale).toBe(false);
    expect(res.json().rates).toEqual({ USD: 0.65, GBP: 0.51 });
    expect(called).toBe(false);
  });

  it("refreshes and re-caches a snapshot past the 6h TTL", async () => {
    await seedSnapshot({ USD: "0.6500000000" }, SIX_HOURS_MS + 60_000);
    provider.setFxProvider({
      async fetchRates() {
        return { USD: "0.7000000000", NPR: "88.5000000000" };
      },
    });

    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().stale).toBe(false);
    expect(res.json().rates).toEqual({ USD: 0.7, NPR: 88.5 });

    // A second call is served from the new snapshot, not from the provider.
    provider.setFxProvider({
      async fetchRates() {
        throw new Error("should not be called");
      },
    });
    const again = await get();
    expect(again.json().stale).toBe(false);
    expect(again.json().rates.USD).toBe(0.7);
  });

  it("fills an empty cache from the provider", async () => {
    provider.setFxProvider({ async fetchRates() { return { USD: "0.6612345678" }; } });

    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ base: BASE, stale: false });
    expect(res.json().rates.USD).toBeCloseTo(0.6612345678, 10);
  });

  // ── EXACT STORAGE (money-adjacent) ────────────────────────────────────────

  it("stores rates as numeric, not as a float — every digit survives", async () => {
    // 0.1 + 0.2 territory: this value is not representable as a short double, so a
    // jsonb/float round-trip would come back changed.
    provider.setFxProvider({ async fetchRates() { return { USD: "0.1234567891" }; } });
    await get();

    const row = await masterKnex("fx_rate_cache")
      .select("rate")
      .where({ base_currency: BASE, quote_currency: "USD" })
      .first();
    // pg returns numeric as a string; comparing strings is the point of the test.
    expect(String(row.rate)).toBe("0.1234567891");
  });

  it("refuses a non-positive rate at the database level", async () => {
    await expect(
      masterKnex("fx_rate_cache").insert({
        base_currency: BASE,
        quote_currency: "USD",
        rate: "0",
      }),
    ).rejects.toThrow();
  });

  it("reads the newest snapshot when several exist", async () => {
    await seedSnapshot({ USD: "0.6000000000" }, 3 * 60 * 60 * 1000);
    await seedSnapshot({ USD: "0.6100000000" }, 60_000);

    const res = await get();
    expect(res.json().rates.USD).toBe(0.61);
    expect(res.json().stale).toBe(false);
  });

  it("does not mix a fresh pair with a stale one — freshness is per snapshot", async () => {
    await seedSnapshot({ USD: "0.6000000000", NPR: "80.0000000000" }, SIX_HOURS_MS + 60_000);
    await seedSnapshot({ USD: "0.6100000000" }, 60_000);

    // The newest snapshot has only USD, so NPR is absent rather than two-days-old.
    const res = await get();
    expect(res.json().rates).toEqual({ USD: 0.61 });
  });
});
