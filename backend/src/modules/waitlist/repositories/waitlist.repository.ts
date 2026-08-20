import { masterKnex } from "../../../core/db/master-pool.js";

const T = "waitlist_registrations";

/** Returns the inserted row, or undefined if this (email, registrant_type) pair already existed. */
export async function insertIgnoreDup(row: { name: string; email: string; registrant_type: string }) {
  const [inserted] = await masterKnex(T).insert(row).onConflict(["email", "registrant_type"]).ignore().returning("id");
  return inserted as { id: number } | undefined;
}
