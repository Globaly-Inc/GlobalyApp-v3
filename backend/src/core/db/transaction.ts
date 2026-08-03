// Transaction helper — wraps a callback in a Knex transaction.
// Automatically commits on success, rolls back on error.

import type { Knex } from "knex";

/** Run fn inside a transaction. Commits on success, rolls back on throw. */
export async function withTransaction<T>(
  db: Knex,
  fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}
