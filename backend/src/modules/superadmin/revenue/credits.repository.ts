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

export interface DailyLogRow {
  platform_user_id: number;
  owner_name: string;
  owner_email: string;
  country_name: string | null;
  total_granted: number;
  total_used: number;
  net_change: number;
  transaction_count: number;
  closing_balance: number;
}

export interface ChartDataRow {
  date: string; // YYYY-MM-DD
  series: string;
  value: number;
}

export type ChartMetric = "total" | "by_reason" | "by_balance_type" | "by_user" | "by_region";

/** Returns the start of the next UTC day as a YYYY-MM-DD string. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function listDailyLog(
  date: string,
  limit: number,
  offset: number,
  search?: string,
): Promise<DailyLogRow[]> {
  const end = nextDay(date);
  const searchClause = search
    ? "AND (pu.first_name ILIKE ? OR pu.last_name ILIKE ? OR pu.email ILIKE ?)"
    : "";
  const searchBindings = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  const sql = `
    SELECT
      pu.id AS platform_user_id,
      (pu.first_name || ' ' || pu.last_name) AS owner_name,
      pu.email AS owner_email,
      co.name AS country_name,
      SUM(CASE WHEN ct.amount > 0 THEN ct.amount ELSE 0 END)::int AS total_granted,
      ABS(SUM(CASE WHEN ct.amount < 0 THEN ct.amount ELSE 0 END))::int AS total_used,
      SUM(ct.amount)::int AS net_change,
      COUNT(*)::int AS transaction_count,
      (cw.free_balance + cw.subscription_balance + cw.purchased_balance)
        - COALESCE((
          SELECT SUM(ct2.amount)
          FROM credit_transactions ct2
          WHERE ct2.wallet_id = cw.id AND ct2.created_at >= ?
        ), 0) AS closing_balance
    FROM credit_transactions ct
    JOIN credit_wallets cw ON cw.id = ct.wallet_id
    JOIN platform_users pu ON pu.id = cw.platform_user_id
    LEFT JOIN platform_user_profiles pup ON pup.user_id = pu.id
    LEFT JOIN countries co ON co.id = pup.country_of_residence_id
    WHERE ct.created_at >= ? AND ct.created_at < ?
    ${searchClause}
    GROUP BY pu.id, pu.first_name, pu.last_name, pu.email, co.name, cw.id
    ORDER BY total_used DESC
    LIMIT ? OFFSET ?
  `;

  // binding order: end (closing_balance subquery), date, end, [...search×3], limit, offset
  const result = await masterKnex.raw(sql, [end, date, end, ...searchBindings, limit, offset]);
  return result.rows;
}

export async function countDailyLog(date: string, search?: string): Promise<number> {
  const end = nextDay(date);
  const searchClause = search
    ? "AND (pu.first_name ILIKE ? OR pu.last_name ILIKE ? OR pu.email ILIKE ?)"
    : "";
  const searchBindings = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  const sql = `
    SELECT COUNT(DISTINCT pu.id) AS count
    FROM credit_transactions ct
    JOIN credit_wallets cw ON cw.id = ct.wallet_id
    JOIN platform_users pu ON pu.id = cw.platform_user_id
    WHERE ct.created_at >= ? AND ct.created_at < ?
    ${searchClause}
  `;

  const result = await masterKnex.raw(sql, [date, end, ...searchBindings]);
  return Number(result.rows[0].count);
}

export async function getChartData(metric: ChartMetric, days: number): Promise<ChartDataRow[]> {
  // days is validated to 7|30|90 before reaching here — safe to interpolate
  const interval = `${days} days`;
  let sql: string;

  switch (metric) {
    case "total":
      sql = `
        SELECT DATE(created_at)::text AS date,
               'total' AS series,
               SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)::int AS value
        FROM credit_transactions
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY DATE(created_at)
        ORDER BY date
      `;
      break;

    case "by_reason":
      sql = `
        SELECT DATE(created_at)::text AS date,
               reason AS series,
               ABS(SUM(amount))::int AS value
        FROM credit_transactions
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY DATE(created_at), reason
        ORDER BY date, reason
      `;
      break;

    case "by_balance_type":
      sql = `
        SELECT DATE(created_at)::text AS date,
               balance_type AS series,
               ABS(SUM(amount))::int AS value
        FROM credit_transactions
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY DATE(created_at), balance_type
        ORDER BY date, balance_type
      `;
      break;

    case "by_user":
      sql = `
        WITH top_users AS (
          SELECT cw.id AS wallet_id,
                 (pu.first_name || ' ' || pu.last_name) AS uname
          FROM credit_transactions ct
          JOIN credit_wallets cw ON cw.id = ct.wallet_id
          JOIN platform_users pu ON pu.id = cw.platform_user_id
          WHERE ct.created_at >= NOW() - INTERVAL '${interval}' AND ct.amount < 0
          GROUP BY cw.id, pu.first_name, pu.last_name
          ORDER BY SUM(ABS(ct.amount)) DESC
          LIMIT 5
        )
        SELECT DATE(ct.created_at)::text AS date,
               tu.uname AS series,
               ABS(SUM(ct.amount))::int AS value
        FROM credit_transactions ct
        JOIN top_users tu ON tu.wallet_id = ct.wallet_id
        WHERE ct.created_at >= NOW() - INTERVAL '${interval}' AND ct.amount < 0
        GROUP BY DATE(ct.created_at), tu.uname
        ORDER BY date, series
      `;
      break;

    case "by_region":
      sql = `
        WITH wallet_countries AS (
          SELECT cw.id AS wallet_id,
                 COALESCE(co.name, 'Unknown') AS country
          FROM credit_wallets cw
          JOIN platform_users pu ON pu.id = cw.platform_user_id
          LEFT JOIN platform_user_profiles pup ON pup.user_id = pu.id
          LEFT JOIN countries co ON co.id = pup.country_of_residence_id
        ),
        top_countries AS (
          SELECT wc.country
          FROM credit_transactions ct
          JOIN wallet_countries wc ON wc.wallet_id = ct.wallet_id
          WHERE ct.created_at >= NOW() - INTERVAL '${interval}' AND ct.amount < 0
          GROUP BY wc.country
          ORDER BY SUM(ABS(ct.amount)) DESC
          LIMIT 5
        )
        SELECT DATE(ct.created_at)::text AS date,
               wc.country AS series,
               ABS(SUM(ct.amount))::int AS value
        FROM credit_transactions ct
        JOIN wallet_countries wc ON wc.wallet_id = ct.wallet_id
        WHERE ct.created_at >= NOW() - INTERVAL '${interval}'
          AND ct.amount < 0
          AND wc.country IN (SELECT country FROM top_countries)
        GROUP BY DATE(ct.created_at), wc.country
        ORDER BY date, series
      `;
      break;
    default:
      return [];
  }

  const result = await masterKnex.raw(sql);
  return result.rows;
}
