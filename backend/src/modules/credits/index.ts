// Credits module — public surface.
//
// This barrel is the encapsulation boundary for the credit ledger. `addReferralReward` is
// deliberately NOT re-exported: only qualification.service.ts may mint a referral reward, and it
// imports the repository directly. Everything else gets addTransaction, whose `kind` type excludes
// 'referral_reward', so an accidental reward write does not compile.
//
// No Fastify routes yet: the personal credits page is Phase 2 and the admin ledger is Phase 3.
// ponytail: no empty module wrapper until there is a route to register.

export { addTransaction, balance, listTransactions, countTransactions } from "./credits.repository.js";
export type { OwnerType, GeneralKind, CreditTransactionRow } from "./credits.repository.js";
