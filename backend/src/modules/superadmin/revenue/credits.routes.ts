import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PaginationSchema, paginationToOffset, buildPaginatedResponse } from "../../../shared/pagination.js";
import * as repo from "./credits.repository.js";
import * as creditService from "../../ai-counsellor/services/credit.service.js";
import type { ChartDataRow, ChartMetric } from "./credits.repository.js";

const VALID_REASONS = ["signup_grant", "message", "purchase", "admin_grant", "subscription_grant"] as const;

const VALID_METRICS = ["total", "by_reason", "by_balance_type", "by_user", "by_region"] as const;
const VALID_DAYS = [7, 30, 90] as const;

const SERIES_LABELS: Record<string, string> = {
  total: "Total Usage",
  message: "AI Tool Usage",
  signup_grant: "Signup Grant",
  admin_grant: "Manual Adjustment",
  subscription_grant: "Subscription Grant",
  purchase: "Purchase",
  free: "Free Credits",
  subscription: "Subscription Credits",
  purchased: "Purchased Credits",
};

function groupIntoSeries(rows: ChartDataRow[]) {
  const map = new Map<string, { date: string; value: number }[]>();
  for (const row of rows) {
    if (!map.has(row.series)) map.set(row.series, []);
    map.get(row.series)!.push({ date: row.date, value: row.value });
  }
  return Array.from(map.entries()).map(([key, data]) => ({
    key,
    label: SERIES_LABELS[key] ?? key,
    data,
  }));
}

const ListQuery = PaginationSchema.extend({
  reason: z.enum(VALID_REASONS).optional(),
  search: z.string().optional(),
});

const AdjustBody = z.object({
  user_id: z.number().int().positive(),
  amount: z.number().int().refine((n) => n !== 0, "Amount cannot be zero"),
  balance_type: z.enum(["free", "subscription", "purchased"]).default("free"),
  description: z.string().trim().min(1, "Description is required").max(500),
});

const UserSearchQuery = z.object({ q: z.string().default(""), role: z.enum(["platform", "admin"]).default("platform") });

export async function adminCreditsRoutes(app: FastifyInstance) {
  // GET /credits/ledger — all transactions across the platform
  app.get("/credits/ledger", async (req, reply) => {
    const { reason, search, ...pagination } = ListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      repo.listLedger(limit, offset, reason, search),
      repo.countLedger(reason, search),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // POST /credits/adjust — manual grant or deduction
  app.post("/credits/adjust", async (req, reply) => {
    const { user_id, amount, balance_type, description } = AdjustBody.parse(req.body ?? {});
    // Positive = grant (admin_grant), negative = deduct (also admin_grant, negative amount)
    await creditService.grantCredits(user_id, amount, balance_type, "admin_grant", description);
    return reply.send({ ok: true });
  });

  // GET /credits/users/search — user autocomplete for the modal
  app.get("/credits/users/search", async (req, reply) => {
    const { q, role } = UserSearchQuery.parse(req.query);
    const users = await repo.searchUsers(q, role);
    return reply.send(users);
  });

  // GET /credits/daily — per-user daily aggregate for a given date
  app.get("/credits/daily", async (req, reply) => {
    const DailyQuery = PaginationSchema.extend({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(new Date().toISOString().slice(0, 10)),
      search: z.string().optional(),
    });
    const { date, search, ...pagination } = DailyQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      repo.listDailyLog(date, limit, offset, search),
      repo.countDailyLog(date, search),
    ]);
    return reply.send({ ...buildPaginatedResponse(rows, total, pagination), date });
  });

  // GET /credits/chart — time-series credit usage by selectable metric
  app.get("/credits/chart", async (req, reply) => {
    const ChartQuery = z.object({
      metric: z.enum(VALID_METRICS).default("total"),
      days: z.coerce.number().refine((n): n is 7 | 30 | 90 => VALID_DAYS.includes(n as 7 | 30 | 90)).default(30),
    });
    const { metric, days } = ChartQuery.parse(req.query);
    const rows = await repo.getChartData(metric as ChartMetric, days);
    const series = groupIntoSeries(rows);
    return reply.send({ metric, days, series });
  });
}
