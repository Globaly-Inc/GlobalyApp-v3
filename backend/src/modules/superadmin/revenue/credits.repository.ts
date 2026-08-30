import { masterKnex } from "../../../core/db/master-pool.js";
import type { Knex } from "knex";

export interface LedgerRow {
  id: number;
  created_at: Date;
  amount: number;
  balance_type: "free" | "subscription" | "purchased";
  reason: "signup_grant" | "message" | "purchase" | "admin_grant" | "subscription_grant";
  description: string | null;
  platform_user_id: number;
  owner_name: string;
  owner_email: string;
  balance_after: number;
}

export interface UserSearchRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

// CTE computes balance_after over ALL wallet transactions (unfiltered partition),
// then the outer WHERE applies type/search filters so the window sums stay accurate.
const LEDGER_CTE = `
  WITH ranked AS (
    SELECT
      ct.id,
      ct.created_at,
      ct.amount,
      ct.balance_type,
      ct.reason,
      ct.description,
      pu.id                              AS platform_user_id,
      (pu.first_name || ' ' || pu.last_name) AS owner_name,
      pu.email                           AS owner_email,
      (cw.free_balance + cw.subscription_balance + cw.purchased_balance)
        - COALESCE(
            SUM(ct.amount) OVER (
              PARTITION BY ct.wallet_id
              ORDER BY ct.created_at ASC, ct.id ASC
              ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
            ),
            0
          ) AS balance_after
    FROM credit_transactions ct
    JOIN credit_wallets cw ON cw.id = ct.wallet_id
    JOIN platform_users pu ON pu.id = cw.platform_user_id
  )
`;

function buildFilters(reason?: string, search?: string) {
  const clauses: string[] = [];
  const bindings: Knex.Value[] = [];
  if (reason) { clauses.push("reason = ?"); bindings.push(reason); }
  if (search) { clauses.push("description ILIKE ?"); bindings.push(`%${search}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, bindings };
}

export async function listLedger(
  limit: number,
  offset: number,
  reason?: string,
  search?: string,
): Promise<LedgerRow[]> {
  const { where, bindings } = buildFilters(reason, search);
  const sql = `${LEDGER_CTE} SELECT * FROM ranked ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const result = await masterKnex.raw(sql, [...bindings, limit, offset]);
  return result.rows;
}

export async function countLedger(reason?: string, search?: string): Promise<number> {
  const { where, bindings } = buildFilters(reason, search);
  const sql = `${LEDGER_CTE} SELECT COUNT(*) AS count FROM ranked ${where}`;
  const result = await masterKnex.raw(sql, bindings);
  return Number(result.rows[0].count);
}

export async function searchUsers(q: string, role: "platform" | "admin" = "platform", limit = 10): Promise<UserSearchRow[]> {
  const base = masterKnex("platform_users")
    .select("platform_users.id", "platform_users.first_name", "platform_users.last_name", "platform_users.email")
    .whereNull("platform_users.deleted_at")
    .orderBy("platform_users.first_name")
    .limit(limit);

  if (q.trim()) {
    base.where((b) =>
      b
        .whereILike("platform_users.first_name", `%${q}%`)
        .orWhereILike("platform_users.last_name", `%${q}%`)
        .orWhereILike("platform_users.email", `%${q}%`),
    );
  }

  if (role === "admin") {
    base
      .join("superadmin.admin_users", "superadmin.admin_users.platform_user_id", "platform_users.id")
      .whereNull("superadmin.admin_users.deleted_at");
  } else {
    base.whereNotExists(
      masterKnex("superadmin.admin_users")
        .whereRaw("superadmin.admin_users.platform_user_id = platform_users.id")
        .whereNull("superadmin.admin_users.deleted_at")
        .select(masterKnex.raw("1")),
    );
  }

  return base;
}
