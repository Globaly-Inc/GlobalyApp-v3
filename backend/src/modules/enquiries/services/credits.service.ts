// Credit balance for the enquiry unlock paywall.
//
// DELIBERATELY A SINGLE IN-CODE VARIABLE. The PRD's substrate for this is
// `credit_wallets` + `business_ledger` (§8.5), which were cut in the
// scope-reduction pass and do not exist. This module is the agreed placeholder so
// the unlock flow can be built and tested now, with the same call shape the real
// wallet will have (getBalance / deduct) — swapping it out becomes a change of
// body, not of call sites.
//
// Known and accepted consequences. Do not treat a balance here as authoritative:
//   - Resets to STARTING_CREDITS on every process restart.
//   - ONE POOL FOR ALL BUSINESSES — Parramatta unlocking lowers the balance London
//     sees. There is no per-business isolation, so "this business is out of
//     credits" cannot be modelled.
//   - Per-process, so the API server and the match worker hold separate balances.
//     Only unlocks spend credits and those go through the API, so that is currently
//     harmless.
//   - No ledger. A spend leaves no trail beyond `enquiry_distributions.coin_cost`
//     and the audit_logs row written by the unlock.
//
// ponytail: replace wholesale with credit_wallets + a locked deduct when the wallet
// lands. Do not grow features on top of this.

export const UNLOCK_COST = Number(process.env.ENQUIRY_UNLOCK_COST) || 30;

const STARTING_CREDITS = Number(process.env.ENQUIRY_STARTING_CREDITS) || 500;

let credits = STARTING_CREDITS;

export function getBalance(): number {
  return credits;
}

/**
 * Spends `amount` if the balance covers it, returning the new balance — or null
 * when there are insufficient credits, which callers turn into a 402 and must NOT
 * proceed past.
 *
 * The read and the write happen in one tick with no await between them, which is
 * the only reason this is safe against interleaving. ponytail: a DB-backed wallet
 * needs `SELECT ... FOR UPDATE` instead — this trick does not survive the move.
 */
export function deduct(amount: number): number | null {
  if (credits < amount) return null;
  credits -= amount;
  return credits;
}

/** Puts credits back when an unlock transaction fails after the deduction. */
export function refund(amount: number): number {
  credits += amount;
  return credits;
}

/** Test-only: restore a known starting point between cases. */
export function resetForTests(to: number = STARTING_CREDITS): number {
  credits = to;
  return credits;
}
