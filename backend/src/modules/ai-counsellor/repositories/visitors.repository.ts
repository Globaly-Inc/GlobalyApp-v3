// Read side of ai_widget_visitors — the tenant's own list of widget visitors and leads.
//
// Isolation is the CONNECTION, not a filter. These rows live in the tenant schema, so the
// `req.db` a route hands in is already the business/institution boundary (tenant.plugin
// resolves it from the token's orgId). There is no owner column here to forget in a WHERE
// clause, which is the only reason cross-tenant leakage isn't a live risk on this table —
// see visitor.service's tenantDbFor for the same split from the public/write side.
//
// Status is DERIVED, never stored. The contact card is the one thing that can promote a
// visitor and the row already records its outcome, so a status column would be a copy that
// can disagree with what it was copied from — and the request was explicitly that the stored
// visitor data decides this, not a value someone picks in the UI.

import type { Knex } from "knex";
import { paginationToOffset, type PaginationInput } from "../../../shared/pagination.js";

const TABLE = "ai_widget_visitors";

export type VisitorStatus = "visitor" | "lead";
export type VisitorStatusFilter = VisitorStatus | "all";

export interface VisitorListParams extends PaginationInput {
  status: VisitorStatusFilter;
  search?: string;
}

/**
 * What a tenant may see of their own visitor row — an allow-list, not a `select *`.
 *
 * `visitor_key` is deliberately absent. It is sha256(browser fingerprint : embed key): an
 * identifier for correlating one person's sessions, and shipping it to a page that only needs
 * to draw a name would put a cross-site tracking token in the DOM. `summary_error`,
 * `contact_prompt_count` and the prompt-schedule counters are absent for a duller reason —
 * they are internals of the capture machinery, not facts about the person.
 */
const COLUMNS = [
  "id",
  "embed_config_id",
  "session_id",
  "name",
  "email",
  // Stored, not computed here — a GENERATED ALWAYS column (20260923_001). Postgres keeps it in
  // step with name/email on every write, so no writer in this module can leave it stale and
  // nothing can set it by hand.
  "status",
  "contact_status",
  "contact_submitted_at",
  "conversation_state",
  "message_count",
  "first_seen_at",
  "last_activity_at",
  // Self-reported and model-extracted — a lead signal, never a record. The UI labels it as
  // "what they told the assistant" for the same reason the migration keeps it in jsonb.
  "qualifications",
  "language_tests",
  "academic_tests",
  "work_experiences",
  // Same provenance as the arrays above — stated by the visitor, read out of prose by a model,
  // never inferred. `age` is verbatim, so the UI must not present it as a bucket.
  // `nationality_raw` is the visitor's own wording and is only set when it differs from the
  // resolved country or matched none; the drawer shows it so a wrong resolution is visible.
  "age",
  "gender",
  "nationality",
  "nationality_raw",
  "study_preference",
  "summary_status",
  "summary_sent_at",
] as const;

/** Status filter + search, shared by the page query and the tab counts so they cannot drift. */
function applyFilters(q: Knex.QueryBuilder, params: Pick<VisitorListParams, "status" | "search">) {
  // The same column the row hands back as its status, so a tab can never list a row whose badge
  // contradicts the tab it was found under. Before 20260923_001 this was an `email IS NULL`
  // test and the badge was a CASE expression — two places to keep in step, now one.
  if (params.status !== "all") q.where({ status: params.status });

  const term = params.search?.trim();
  if (term) {
    const like = `%${term}%`;
    // Anonymous rows have neither column, so they never match a search — which is right:
    // there is nothing there to have searched for.
    q.where((b) => b.whereILike("name", like).orWhereILike("email", like));
  }
  return q;
}

/**
 * One page of visitors, newest activity first — unexecuted, so tests can read the SQL without
 * a database (tests/widget-visitor-list.ts). Knex builders are thenable, so callers just await.
 */
export function listQuery(db: Knex, params: VisitorListParams): Knex.QueryBuilder {
  const { limit, offset } = paginationToOffset(params);
  return applyFilters(db(TABLE), params)
    .select(...COLUMNS)
    .orderBy("last_activity_at", "desc")
    .limit(limit)
    .offset(offset);
}

/**
 * The three tab tallies in one round trip.
 *
 * Counted off the same `status` column the Leads tab filters on, so a tab can never show a
 * tally its own list contradicts. The search term applies here too: the counts describe what
 * the tabs would actually show, not how many rows exist.
 *
 * CAST(... AS int) and not `::int`: knex parses `:name` as a binding placeholder, so a colon
 * cast is a silent-rewrite hazard in any raw string (see the 20260923_001 migration).
 */
export function countsQuery(db: Knex, params: Pick<VisitorListParams, "search">): Knex.QueryBuilder {
  return applyFilters(db(TABLE), { status: "all", search: params.search }).select(
    db.raw("CAST(count(*) AS int) AS total_count"),
    db.raw("CAST(count(*) FILTER (WHERE status = 'lead') AS int) AS lead_count"),
  );
}

export type VisitorCounts = Record<VisitorStatusFilter, number>;

export async function visitorCounts(
  db: Knex,
  params: Pick<VisitorListParams, "search">,
): Promise<VisitorCounts> {
  const [row] = (await countsQuery(db, params)) as { total_count: number; lead_count: number }[];
  const all = row?.total_count ?? 0;
  const lead = row?.lead_count ?? 0;
  return { all, lead, visitor: all - lead };
}
