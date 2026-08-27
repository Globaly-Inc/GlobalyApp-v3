import { masterKnex } from "../../../../../core/db/master-pool.js";

export interface Subscriber {
  source: "newsletter" | "early_interest" | "guide_lead";
  name: string;
  email: string;
  detail: string | null;
  created_at: string;
}

type SubscriberFilters = {
  search?: string;
  type?: "newsletter" | "early_interest" | "guide_lead";
};

// ponytail: union of three sources with minimal shared shape — newsletter (source, name, email, null detail),
// early_interest (source, name, email, type as detail), guide_lead (source, name, email, guide title as detail).
export async function listSubscribers(limit: number, offset: number, filters: SubscriberFilters) {
  const searchPattern = filters.search ? `%${filters.search}%` : undefined;

  const rows = await masterKnex.raw(`
    SELECT
      'newsletter' as source,
      name,
      email,
      NULL::text as detail,
      created_at
    FROM public.waitlist_registrations
    WHERE registrant_type = 'newsletter'
    ${searchPattern ? "AND (email ILIKE ? OR name ILIKE ?)" : ""}

    UNION ALL

    SELECT
      'early_interest' as source,
      name,
      email,
      registrant_type as detail,
      created_at
    FROM public.waitlist_registrations
    WHERE registrant_type IN ('student', 'institution', 'service_provider', 'other')
    ${searchPattern ? "AND (email ILIKE ? OR name ILIKE ?)" : ""}

    UNION ALL

    SELECT
      'guide_lead' as source,
      name,
      email,
      t.title as detail,
      gl.created_at
    FROM superadmin.guide_leads gl
    JOIN superadmin.guides t ON gl.guide_id = t.id
    ${searchPattern ? "AND (gl.email ILIKE ? OR gl.name ILIKE ?)" : ""}

    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `,
  searchPattern
    ? [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, limit, offset]
    : [limit, offset],
  );

  let results: Subscriber[] = rows.rows || rows;

  // Apply type filter at the application level
  if (filters.type) {
    results = results.filter((r: Subscriber) => r.source === filters.type);
  }

  return results;
}

export async function countSubscribers(filters: SubscriberFilters) {
  const searchPattern = filters.search ? `%${filters.search}%` : undefined;

  const countResult = await masterKnex.raw(`
    SELECT COUNT(*) as total FROM (
      SELECT 1 FROM public.waitlist_registrations
      WHERE registrant_type = 'newsletter'
      ${searchPattern ? "AND (email ILIKE ? OR name ILIKE ?)" : ""}

      UNION ALL

      SELECT 1 FROM public.waitlist_registrations
      WHERE registrant_type IN ('student', 'institution', 'service_provider', 'other')
      ${searchPattern ? "AND (email ILIKE ? OR name ILIKE ?)" : ""}

      UNION ALL

      SELECT 1 FROM superadmin.guide_leads gl
      JOIN superadmin.guides t ON gl.guide_id = t.id
      ${searchPattern ? "AND (gl.email ILIKE ? OR gl.name ILIKE ?)" : ""}
    ) counts
  `,
  searchPattern
    ? [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
    : [],
  );

  const rows = countResult.rows || countResult;
  let total = Number((rows[0] as any).total);

  // Apply type filter effect on count
  if (filters.type) {
    const typeCountResult = await masterKnex.raw(`
      SELECT COUNT(*) as cnt FROM public.waitlist_registrations
      WHERE registrant_type = ?
      ${searchPattern ? "AND (email ILIKE ? OR name ILIKE ?)" : ""}
    `, [filters.type, ...(searchPattern ? [searchPattern, searchPattern] : [])]);

    const typeRows = typeCountResult.rows || typeCountResult;
    total = Number((typeRows[0] as any).cnt);
  }

  return total;
}

// CSV export with proper escaping. Values are public-form input, so a cell
// starting with = + - @ (or tab/CR) would execute as a formula when the export
// opens in Excel/Sheets — prefix those with ' to neutralise (OWASP CSV injection).
export function escapeCsvField(value: string | null): string {
  if (!value) return "";
  const defused = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (defused.includes(",") || defused.includes('"') || defused.includes("\n")) {
    return `"${defused.replace(/"/g, '""')}"`;
  }
  return defused;
}

export function buildCsvRow(subscriber: Subscriber): string {
  const fields = [
    escapeCsvField(subscriber.source),
    escapeCsvField(subscriber.name),
    escapeCsvField(subscriber.email),
    escapeCsvField(subscriber.detail),
    escapeCsvField(subscriber.created_at),
  ];
  return fields.join(",");
}

export function buildCsvHeader(): string {
  return "Source,Name,Email,Detail,Created At";
}
