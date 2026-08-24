import { masterKnex } from "../../../core/db/master-pool.js";

export interface PlanRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  billing_interval: "month" | "year";
  included_credits: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export async function listActivePlans(): Promise<PlanRow[]> {
  return masterKnex("subscription_plans")
    .where({ is_active: true })
    .whereNull("deleted_at")
    .orderBy("sort_order", "asc");
}

export async function findByCode(code: string): Promise<PlanRow | undefined> {
  return masterKnex("subscription_plans").where({ code, is_active: true }).whereNull("deleted_at").first();
}
