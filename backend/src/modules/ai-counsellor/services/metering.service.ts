// Per-token AI metering.
//
// ── The rule ──
// A turn is metered ONCE, at settlement, for the tokens actually delivered to the
// client, and the charge lands on the wallet that owns the session.
//
//  1. Every turn is given a `turnId` before the provider is called. Settlement
//     writes exactly one `ai_usage_events` row keyed on it (UNIQUE), and the wallet
//     debit happens in the SAME transaction. A second settlement — a retry, a
//     reconnect, a genuinely concurrent replay — loses the insert and therefore
//     never reaches the debit. So: no charge without a usage row, no usage row
//     without its charge, exactly one of each per turn.
//
//  2. Tokens are the delivered ones. On a clean finish those are the provider's
//     own figures. On a stream that dies mid-answer the provider reports nothing,
//     so the row is an estimate over the bytes that reached the client — which is
//     always ≤ the full answer, so a broken stream can never cost more than a whole
//     one. Nothing delivered at all is not metered: no row, no charge.
//
//  3. The debit is clamped to the wallet's spendable balance. A turn already
//     answered must always settle; the pre-flight gate is what refuses an empty
//     wallet with a 402, before the provider is ever reached.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as billingCredits from "../../billing/services/credits.service.js";
import * as billingRepo from "../../billing/repositories/billing.repository.js";
import { AI_PROVIDER, costMicros, creditsFor } from "../consts.js";
import * as creditsRepo from "../repositories/credits.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as usageRepo from "../repositories/usage.repository.js";
import type { ChatScope } from "./scope.js";

const logger = createChildLogger("ai-metering");

export interface SettleInput {
  /** Minted per turn, before the provider is called. */
  turnId: string;
  scope: ChatScope;
  sessionId: number | null;
  messageId: number | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  outcome: "complete" | "interrupted";
}

export interface SettleResult {
  /** Credits that actually left the wallet. */
  charged: number;
  /** True when this turn had already been settled. */
  duplicate: boolean;
  /** False when nothing was delivered, so nothing was recorded. */
  metered: boolean;
}

const NOT_METERED: SettleResult = { charged: 0, duplicate: false, metered: false };

/** The ledger key for a chat spend. Shared by every bucket a single turn touches. */
function ledgerKey(turnId: string, suffix: string): string {
  return `ai-turn:${turnId}:${suffix}`;
}

export async function settleTurn(input: SettleInput): Promise<SettleResult> {
  // Nothing reached the client → nothing to meter and nothing to charge.
  if (input.completionTokens <= 0) return NOT_METERED;

  const { scope } = input;
  const totalTokens = input.promptTokens + input.completionTokens;
  const credits = creditsFor(input.promptTokens, input.completionTokens);

  // Provisioned outside the transaction: it is idempotent (ON CONFLICT DO NOTHING)
  // and holding a lock across it would serialise unrelated turns.
  const walletId =
    scope.ownerType === "user" ? (await creditsRepo.ensureUserWallet(scope.userId)).id : null;

  return masterKnex.transaction(async (trx) => {
    const event = await usageRepo.claimUsageEvent(
      {
        idempotency_key: `ai-turn:${input.turnId}`,
        owner_type: scope.ownerType,
        platform_user_id: scope.userId,
        business_id: scope.businessId,
        session_id: input.sessionId,
        message_id: input.messageId,
        provider: AI_PROVIDER,
        model: input.model,
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        total_tokens: totalTokens,
        cost_micros: costMicros(input.model, input.promptTokens, input.completionTokens),
        credits_charged: 0,
        outcome: input.outcome,
      },
      trx,
    );

    if (!event) {
      logger.info("Turn already settled", { turnId: input.turnId });
      return { charged: 0, duplicate: true, metered: false };
    }

    const charged =
      scope.ownerType === "business"
        ? await debitBusiness(scope.businessId, credits, input, event.id, trx)
        : await debitUser(walletId!, credits, input, event.id, trx);

    if (charged > 0) {
      await usageRepo.setCreditsCharged(event.id, charged, trx);
      if (input.sessionId) await sessionsRepo.addCreditsUsed(input.sessionId, charged, trx);
    }

    return { charged, duplicate: false, metered: true };
  });
}

/**
 * Personal chat → the caller's own user wallet. Waterfall free → subscription →
 * purchased, one ledger row per bucket that actually moved so the split stays
 * auditable across `credit_transactions.balance_type`.
 */
async function debitUser(
  walletId: number,
  credits: number,
  input: SettleInput,
  eventId: number,
  trx: Knex.Transaction,
): Promise<number> {
  const debit = await usageRepo.debitUserWallet(walletId, credits, trx);
  if (debit.charged === 0) return 0;

  const buckets: Array<[creditsRepo.BalanceType, number]> = [
    ["free", debit.fromFree],
    ["subscription", debit.fromSubscription],
    ["purchased", debit.fromPurchased],
  ];

  for (const [balanceType, amount] of buckets) {
    if (amount <= 0) continue;
    await creditsRepo.recordTransaction(
      walletId,
      {
        amount: -amount,
        balanceType,
        reason: "message",
        balanceAfter: debit.balanceAfter,
        referenceType: "ai_usage_event",
        referenceId: eventId,
        idempotencyKey: ledgerKey(input.turnId, balanceType),
      },
      trx,
    );
  }
  return debit.charged;
}

/**
 * Business chat → the business wallet, through billing's own spendCredits so the
 * locking, the bucket split and the ledger shape stay one implementation. The
 * amount is clamped first because spendCredits (correctly) refuses to overdraw,
 * and refusing a turn that has already been answered is not an option here.
 */
async function debitBusiness(
  businessId: number,
  credits: number,
  input: SettleInput,
  eventId: number,
  trx: Knex.Transaction,
): Promise<number> {
  const wallet = await billingRepo.ensureBusinessWallet(businessId, trx);
  const amount = Math.min(credits, wallet.balance);
  if (amount < 1) return 0;

  await billingCredits.spendCredits(
    businessId,
    {
      amount,
      transaction_type: "ai_deduct",
      description: `AI counsellor turn (${input.completionTokens} completion tokens)`,
      reference_type: "ai_usage_event",
      reference_id: String(eventId),
      idempotency_key: ledgerKey(input.turnId, "business"),
    },
    input.scope.userId,
    trx,
  );
  return amount;
}
