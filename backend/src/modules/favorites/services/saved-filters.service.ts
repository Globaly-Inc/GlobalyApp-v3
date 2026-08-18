// Saved-filters orchestration.
//
// `scope` is always built by the route from req.auth.sub + req.business?.id — the
// caller's identity and current business context, never a body or query field. A
// request with no business context has businessId null, which is its own scope.

import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/saved-filters.repository.js";
import type { SaveFilterInput } from "../schemas/saved-filters.schema.js";

export type Scope = repo.Scope;

function serialize(row: repo.SavedFilterRow) {
  return {
    id: row.id,
    module_key: row.module_key,
    name: row.name,
    description: row.description,
    // Returned exactly as stored. It is data; nothing rewrites or escapes it.
    filter_config: row.filter_config,
    shared: row.shared,
    created_by: row.created_by,
    use_count: row.use_count,
    created_at: row.created_at,
  };
}

export async function create(scope: Scope, input: SaveFilterInput) {
  return { id: await repo.create(scope, input) };
}

export async function list(scope: Scope, moduleKey: string) {
  const rows = await repo.listVisible(scope, moduleKey);
  return { data: rows.map(serialize) };
}

export async function apply(scope: Scope, id: number) {
  const useCount = await repo.bumpUseCount(scope, id);
  if (useCount === null) throw new NotFoundError("Filter not found");
  return { use_count: useCount };
}

export async function remove(scope: Scope, id: number) {
  // Owner-only, deliberately narrower than read visibility: a teammate can see a
  // shared filter but must not delete it.
  const deleted = await repo.softDelete(scope.userId, id);
  if (deleted === 0) throw new NotFoundError("Filter not found");
}

export async function getDefault(scope: Scope, moduleKey: string) {
  return { filter_id: await repo.getDefault(scope.userId, moduleKey) };
}

export async function setDefault(scope: Scope, moduleKey: string, filterId: number | null) {
  if (filterId === null) {
    await repo.clearDefault(scope.userId, moduleKey);
    return { updated: true as const };
  }
  // Defaulting to a filter the caller cannot read would let them discover, and
  // silently keep a handle on, someone else's filter.
  if (!(await repo.isVisible(scope, filterId))) throw new NotFoundError("Filter not found");
  await repo.setDefault(scope.userId, moduleKey, filterId);
  return { updated: true as const };
}
