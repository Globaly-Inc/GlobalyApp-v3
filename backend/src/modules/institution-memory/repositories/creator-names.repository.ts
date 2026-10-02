// Resolves a memory's `created_by` into a display name for the portal.
//
// Same shape and the same reason as superadmin/data-extraction/shared/actor-names: one lookup
// keyed by the ids actually present, never a join. Memories live in the institution's own schema
// and platform_users lives in public, so a join here would cross schemas on every list — and the
// list query already relies on unqualified order-by clauses that a second id column would break.
//
// Portal reads only. The retrieval path must never call this: it runs on every widget turn and
// has no use for a name.

import { masterKnex } from "../../../core/db/master-pool.js";

const T_USERS = "public.platform_users";

/** Stored display_names carry doubled spaces here and there, and this renders as-is. */
function displayName(user: { display_name?: string | null; first_name?: string | null; last_name?: string | null }): string | null {
  const name = user.display_name ?? [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name.replace(/\s+/g, " ").trim() || null;
}

/**
 * Attach `created_by_name` to every row.
 *
 * Null for anything the system wrote — a learned candidate or a correction derived by the
 * worker has no author, and that is not the same as a deleted user. The portal reads the null
 * as "your team" and says who only when it actually knows.
 */
export async function withCreatorNames<T extends { created_by: number | null }>(
  rows: T[],
): Promise<(T & { created_by_name: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r.created_by).filter((id): id is number => typeof id === "number"))];
  const users = ids.length
    ? await masterKnex(T_USERS).select("id", "display_name", "first_name", "last_name").whereIn("id", ids)
    : [];
  const byId = new Map(users.map((u) => [u.id as number, displayName(u)]));
  return rows.map((row) => ({
    ...row,
    created_by_name: row.created_by == null ? null : byId.get(row.created_by) ?? null,
  }));
}

/** Single-row form, for the detail and mutation responses. */
export async function withCreatorName<T extends { created_by: number | null }>(
  row: T,
): Promise<T & { created_by_name: string | null }> {
  const [named] = await withCreatorNames([row]);
  return named;
}
