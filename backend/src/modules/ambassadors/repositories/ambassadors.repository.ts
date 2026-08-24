import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { AmbassadorStatus, ConnectOnboardingStatus } from "../consts.js";

export interface AmbassadorRow {
  id: number;
  program_id: number;
  user_id: number;
  application_id: number;
  referral_code: string;
  status: AmbassadorStatus;
  stripe_connect_account_id: string | null;
  connect_onboarding_status: ConnectOnboardingStatus;
  created_at: Date;
  updated_at: Date;
}

export async function insert(
  trx: Knex.Transaction,
  data: { program_id: number; user_id: number; application_id: number; referral_code: string },
): Promise<AmbassadorRow> {
  const [row] = await trx<AmbassadorRow>("ambassadors").insert(data).returning("*");
  return row;
}

export async function findByCodeLower(code: string): Promise<AmbassadorRow | undefined> {
  return masterKnex<AmbassadorRow>("ambassadors").whereRaw("lower(referral_code) = lower(?)", [code]).first();
}

export async function listForProgram(programId: number): Promise<AmbassadorRow[]> {
  return masterKnex<AmbassadorRow>("ambassadors").where({ program_id: programId }).orderBy("created_at", "desc");
}

export async function listForUser(userId: number): Promise<AmbassadorRow[]> {
  return masterKnex<AmbassadorRow>("ambassadors").where({ user_id: userId }).orderBy("created_at", "desc");
}

export async function findByIdForUser(id: number, userId: number): Promise<AmbassadorRow | undefined> {
  return masterKnex<AmbassadorRow>("ambassadors").where({ id, user_id: userId }).first();
}

export async function updateConnectAccount(
  id: number,
  data: { stripe_connect_account_id?: string; connect_onboarding_status: ConnectOnboardingStatus },
): Promise<AmbassadorRow> {
  const [row] = await masterKnex<AmbassadorRow>("ambassadors")
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}
