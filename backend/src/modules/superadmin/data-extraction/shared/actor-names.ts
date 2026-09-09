// Resolves created_by_platform_user_id / updated_by_platform_user_id into display names
// for any extraction row that carries them.
//
// One lookup keyed by the ids actually present, instead of two LEFT JOINs on every list
// query: the list queries all rely on `select *` and unqualified order-by/where clauses,
// which joining platform_users (it has its own id/created_at/updated_at) would break one
// call site at a time. Rows arrive with the ids already on them, so a single extra query
// per page attaches both names with no join to keep correct.

import { masterKnex } from "../../../../core/db/master-pool.js";

const T_USERS = "public.platform_users";

export type ActorFields = {
  created_by_name: string | null;
  created_by_email: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
};

type Row = Record<string, unknown>;

// Some stored display_names carry doubled spaces, and this string renders as-is.
function displayName(user: { display_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  const name = user.display_name ?? [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name.replace(/\s+/g, " ").trim() || null;
}

async function lookup(rows: Row[]) {
  const ids = new Set<number>();
  for (const row of rows) {
    for (const key of ["created_by_platform_user_id", "updated_by_platform_user_id"]) {
      const id = row[key];
      if (typeof id === "number") ids.add(id);
    }
  }
  if (ids.size === 0) return new Map<number, { name: string | null; email: string | null }>();

  const users = await masterKnex(T_USERS)
    .select("id", "display_name", "first_name", "last_name", "email")
    .whereIn("id", [...ids]);
  return new Map(users.map((u) => [u.id as number, { name: displayName(u), email: (u.email as string) ?? null }]));
}

/** Attaches the four actor fields to every row. Unset ids resolve to null — a null
 *  created_by means the pipeline wrote the row, not that the user was deleted. */
export async function withActorNames<T extends Row>(rows: T[]): Promise<(T & ActorFields)[]> {
  if (rows.length === 0) return [];
  const users = await lookup(rows);
  const of = (id: unknown) => (typeof id === "number" ? users.get(id) : undefined);
  return rows.map((row) => {
    const creator = of(row.created_by_platform_user_id);
    const editor = of(row.updated_by_platform_user_id);
    return {
      ...row,
      created_by_name: creator?.name ?? null,
      created_by_email: creator?.email ?? null,
      updated_by_name: editor?.name ?? null,
      updated_by_email: editor?.email ?? null,
    };
  });
}

/** Single-row form, for detail endpoints. */
export async function withActorNamesOne<T extends Row>(row: T | null | undefined) {
  if (!row) return row ?? null;
  const [withNames] = await withActorNames([row]);
  return withNames;
}
