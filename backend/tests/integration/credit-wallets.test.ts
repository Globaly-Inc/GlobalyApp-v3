// One reconciled wallet table for two consumers.
//
// `credit_wallets` / `credit_transactions` used to be created twice — once by the
// AI-counsellor migrations (user-only) and once by the billing migration
// (polymorphic). They are now one pair, shaped from V1. This suite guards the
// constraints that make that safe, and that the AI-counsellor still behaves the
// way it did against its old user-only table.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("credit_wallets (reconciled)", () => {
  let masterKnex: import("knex").Knex;
  let creditService: typeof import("../../src/modules/ai-counsellor/services/credit.service.js");

  let userId = 0;
  let otherUserId = 0;
  let businessId = 0;

  beforeAll(async () => {
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    creditService = await import("../../src/modules/ai-counsellor/services/credit.service.js");

    const suffix = `${process.pid}${Date.now()}`;
    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Wallet",
          last_name: label,
          email: uniqueEmail(`wallet.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return row.id as number;
    };

    userId = await newUser("owner");
    otherUserId = await newUser("other");

    const [biz] = await masterKnex("businesses")
      .insert({
        owner_id: userId,
        subdomain: `wallet-${suffix}`,
        business_name: `Wallet Co ${suffix}`,
        account_status: 1,
        status: "active",
      })
      .returning(["id"]);
    businessId = biz.id;
  });

  afterAll(async () => {
    if (!masterKnex) return;
    // credit_transactions cascades from the wallet, wallets cascade from the owner.
    await masterKnex("businesses").where({ id: businessId }).del();
    await masterKnex("platform_users").whereIn("id", [userId, otherUserId]).del();
    await masterKnex.destroy();
  });

  const insertWallet = (values: Record<string, unknown>) => masterKnex("credit_wallets").insert(values);

  // ── one table, two owner kinds ─────────────────────────────────────────────

  it("holds a user-owned and a business-owned wallet side by side", async () => {
    const [business] = await insertWallet({
      owner_type: "business",
      business_id: businessId,
      subscription_balance: 30,
      purchased_balance: 12,
      balance: 42,
      lifetime_earned: 42,
    }).returning(["id"]);

    const [user] = await insertWallet({
      owner_type: "user",
      platform_user_id: otherUserId,
      free_balance: 10,
    }).returning(["id"]);

    const rows = await masterKnex("credit_wallets")
      .whereIn("id", [business.id, user.id])
      .orderBy("owner_type");

    expect(rows.map((r) => r.owner_type)).toEqual(["business", "user"]);
    expect(rows[0]).toMatchObject({ business_id: businessId, platform_user_id: null, balance: 42 });
    // free_balance is deliberately outside `balance` — a promotional bucket, not money.
    expect(rows[1]).toMatchObject({ platform_user_id: otherUserId, business_id: null, free_balance: 10, balance: 0 });
  });

  // ── exactly one owner ──────────────────────────────────────────────────────

  it("rejects a wallet with both owner columns set", async () => {
    await expect(
      insertWallet({ owner_type: "user", platform_user_id: userId, business_id: businessId }),
    ).rejects.toThrow(/credit_wallets_owner_check/);
  });

  it("rejects a wallet with neither owner column set", async () => {
    await expect(insertWallet({ owner_type: "user" })).rejects.toThrow(/credit_wallets_owner_check/);
    await expect(insertWallet({ owner_type: "business" })).rejects.toThrow(/credit_wallets_owner_check/);
  });

  it("rejects an owner column that disagrees with owner_type", async () => {
    await expect(
      insertWallet({ owner_type: "business", platform_user_id: userId }),
    ).rejects.toThrow(/credit_wallets_owner_check/);
    await expect(
      insertWallet({ owner_type: "user", business_id: businessId }),
    ).rejects.toThrow(/credit_wallets_owner_check/);
  });

  it("rejects an unknown owner_type", async () => {
    await expect(
      insertWallet({ owner_type: "institution", platform_user_id: userId }),
      // Either guard may fire first — an unknown owner_type also fails owner_check.
    ).rejects.toThrow(/credit_wallets_owner(_type)?_check/);
  });

  // ── one wallet per owner ───────────────────────────────────────────────────

  it("rejects a second wallet for the same business", async () => {
    await expect(insertWallet({ owner_type: "business", business_id: businessId })).rejects.toThrow(
      /credit_wallets_business_unique/,
    );
  });

  it("rejects a second wallet for the same user", async () => {
    await expect(insertWallet({ owner_type: "user", platform_user_id: otherUserId })).rejects.toThrow(
      /credit_wallets_user_unique/,
    );
  });

  // ── balance composition ────────────────────────────────────────────────────

  it("requires balance to equal subscription + purchased, ignoring free credits", async () => {
    // The composition rule, stated as a rejection: `balance` may not absorb free credits.
    await expect(
      insertWallet({
        owner_type: "user",
        platform_user_id: userId,
        free_balance: 5,
        subscription_balance: 1,
        purchased_balance: 1,
        balance: 7,
      }),
    ).rejects.toThrow(/credit_wallets_balance_split_check/);

    await expect(
      insertWallet({ owner_type: "user", platform_user_id: userId, subscription_balance: 4, balance: 3 }),
    ).rejects.toThrow(/credit_wallets_balance_split_check/);

    await expect(
      insertWallet({ owner_type: "user", platform_user_id: userId, balance: -1 }),
    ).rejects.toThrow(/credit_wallets_(non_negative|balance_split)_check/);
  });

  // ── AI-counsellor behaviour, unchanged ─────────────────────────────────────

  describe("ai-counsellor credit paths", () => {
    it("lazily provisions a user wallet with 10 free credits", async () => {
      const balance = await creditService.getBalance(userId);
      expect(balance).toEqual({ free: 10, subscription: 0, purchased: 0, total: 10 });

      const wallet = await masterKnex("credit_wallets").where({ platform_user_id: userId }).first();
      expect(wallet).toMatchObject({ owner_type: "user", business_id: null, free_balance: 10, balance: 0 });
      expect(await creditService.checkBalance(userId)).toBe(true);
    });

    it("spends free credits first and writes one ledger row per spend", async () => {
      await creditService.deductCredit(userId, 4242);

      expect(await creditService.getBalance(userId)).toEqual({
        free: 9,
        subscription: 0,
        purchased: 0,
        total: 9,
      });

      const wallet = await masterKnex("credit_wallets").where({ platform_user_id: userId }).first();
      const txn = await masterKnex("credit_transactions")
        .where({ wallet_id: wallet.id })
        .orderBy("id", "desc")
        .first();

      expect(txn).toMatchObject({
        amount: -1,
        balance_type: "free",
        reason: "message",
        // V1's vocabulary on the shared ledger column; `reason` keeps the detail.
        transaction_type: "ai_deduct",
        reference_type: "ai_message",
        reference_id: "4242",
      });
      // balance_after is the spendable total: free + subscription + purchased.
      expect(txn.balance_after).toBe(9);
      // Free credits are promotional, so they never move the monetary counters.
      expect(wallet).toMatchObject({ balance: 0, lifetime_spent: 0 });
    });

    it("keeps balance = subscription + purchased when granting and spending monetary credits", async () => {
      await creditService.grantCredits(userId, 5, "subscription", "subscription_grant");
      await creditService.grantCredits(userId, 3, "purchased", "purchase");

      let wallet = await masterKnex("credit_wallets").where({ platform_user_id: userId }).first();
      expect(wallet).toMatchObject({
        subscription_balance: 5,
        purchased_balance: 3,
        balance: 8,
        lifetime_earned: 8,
      });

      // Waterfall: free is drained first, so these 9 spends stay on free_balance.
      for (let i = 0; i < 9; i += 1) await creditService.deductCredit(userId, 5000 + i);
      expect(await creditService.getBalance(userId)).toEqual({
        free: 0,
        subscription: 5,
        purchased: 3,
        total: 8,
      });

      // The tenth spend crosses into subscription credits and must move `balance` too.
      await creditService.deductCredit(userId, 6000);
      wallet = await masterKnex("credit_wallets").where({ platform_user_id: userId }).first();
      expect(wallet).toMatchObject({
        free_balance: 0,
        subscription_balance: 4,
        purchased_balance: 3,
        balance: 7,
        lifetime_spent: 1,
      });
    });

    it("never creates a second wallet for the same user under concurrency", async () => {
      const fresh = await masterKnex("platform_users")
        .insert({
          first_name: "Wallet",
          last_name: "Race",
          email: uniqueEmail("wallet.race"),
          account_status: 1,
        })
        .returning(["id"]);
      const raceUserId = fresh[0].id as number;

      const wallets = await Promise.all(
        Array.from({ length: 5 }, () => creditService.ensureWallet(raceUserId)),
      );
      expect(new Set(wallets.map((w) => w.id)).size).toBe(1);

      const count = await masterKnex("credit_wallets")
        .where({ platform_user_id: raceUserId })
        .count<{ count: string }[]>("* as count");
      expect(Number(count[0].count)).toBe(1);

      await masterKnex("platform_users").where({ id: raceUserId }).del();
    });
  });
});
