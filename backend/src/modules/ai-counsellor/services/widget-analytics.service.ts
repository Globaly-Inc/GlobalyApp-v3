import { getKnex } from "../../../core/db/pool-manager.js";
import * as embedRepo from "../repositories/embed.repository.js";
import type { EmbedOwner } from "../repositories/embed.repository.js";

interface VisitorRow {
  first_seen_at: string | Date;
  conversation_state: string;
  end_confirmed_at: string | Date | null;
  contact_status: string;
  contact_submitted_at: string | Date | null;
}

const MONTH_LABEL = (d: Date) => d.toLocaleString("en-US", { month: "short" });
const asDate = (v: string | Date | null): Date | null => (v == null ? null : new Date(v));
const inRange = (d: Date | null, from: Date, to: Date) => !!d && d >= from && d < to;
const startOfMonth = (now: Date, offset: number) => new Date(now.getFullYear(), now.getMonth() - offset, 1);

/** prev===0 reports +100% on any real growth rather than a meaningless Infinity/NaN. */
function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export async function getWidgetAnalytics(owner: EmbedOwner, orgId: number, schemaName: string) {
  const configs = await embedRepo.findByOwner(owner);

  const visitors: VisitorRow[] = configs.length === 0 ? [] : await (async () => {
    const db = await getKnex(orgId, schemaName);
    return db("ai_widget_visitors")
      .whereIn("embed_config_id", configs.map((c) => c.id))
      .select("first_seen_at", "conversation_state", "end_confirmed_at", "contact_status", "contact_submitted_at");
  })();

  const now = new Date();
  const thisMonthStart = startOfMonth(now, 0);
  const lastMonthStart = startOfMonth(now, 1);

  const firstSeen = visitors.map((v) => asDate(v.first_seen_at)!);
  const visitorsThisMonth = firstSeen.filter((d) => inRange(d, thisMonthStart, now)).length;
  const visitorsLastMonth = firstSeen.filter((d) => inRange(d, lastMonthStart, thisMonthStart)).length;

  const closed = visitors.filter((v) => v.conversation_state === "end_confirmed");
  const closedThisMonth = closed.filter((v) => inRange(asDate(v.end_confirmed_at), thisMonthStart, now)).length;
  const closedLastMonth = closed.filter((v) => inRange(asDate(v.end_confirmed_at), lastMonthStart, thisMonthStart)).length;

  const converted = visitors.filter((v) => v.contact_status === "submitted");
  const convertedThisMonth = converted.filter((v) => inRange(asDate(v.contact_submitted_at), thisMonthStart, now)).length;
  const convertedLastMonth = converted.filter((v) => inRange(asDate(v.contact_submitted_at), lastMonthStart, thisMonthStart)).length;

  const conversionRate = (num: number, denom: number) => (denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0);
  const rateNow = conversionRate(converted.length, visitors.length);
  const rateThisMonth = conversionRate(convertedThisMonth, visitorsThisMonth);
  const rateLastMonth = conversionRate(convertedLastMonth, visitorsLastMonth);

  const monthStarts = Array.from({ length: 6 }, (_, i) => startOfMonth(now, 5 - i));
  const monthly = monthStarts.map((start, i) => {
    const end = i < 5 ? monthStarts[i + 1] : now;
    return {
      month: MONTH_LABEL(start),
      visitors: firstSeen.filter((d) => inRange(d, start, end)).length,
      conversationsClosed: closed.filter((v) => inRange(asDate(v.end_confirmed_at), start, end)).length,
      conversions: converted.filter((v) => inRange(asDate(v.contact_submitted_at), start, end)).length,
    };
  });

  return {
    stats: {
      visitors: { value: visitors.length, deltaPct: pctChange(visitorsThisMonth, visitorsLastMonth) },
      conversationsClosed: { value: closed.length, deltaPct: pctChange(closedThisMonth, closedLastMonth) },
      conversions: { value: converted.length, delta: convertedThisMonth - convertedLastMonth },
      conversionRate: { value: rateNow, deltaPts: Math.round((rateThisMonth - rateLastMonth) * 10) / 10 },
    },
    monthly,
  };
}
