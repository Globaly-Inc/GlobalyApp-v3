// Enquiries — own-rows-only reads. Deliberately no create/list/update surface: the enquiry lifecycle
// (compose → distribute → status) belongs to its own epic and is built there. Home needs the recent 5 and
// the TRUE total (V2's stat tile read 5 because the list was sliced before being counted).

import { masterKnex } from "../../../core/db/master-pool.js";

export async function summaryForUser(platformUserId: number) {
  const [countRow] = await masterKnex("enquiries")
    .where({ platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .count<{ count: string }[]>("* as count");

  const recent = await masterKnex("enquiries as e")
    .leftJoin("institutions as i", "i.id", "e.institution_id")
    .where("e.platform_user_id", platformUserId)
    .whereNull("e.deleted_at")
    // id is the tiebreaker: enquiries created in the same instant would otherwise come back in an
    // arbitrary order, so "recent" would shuffle between requests.
    .orderBy([
      { column: "e.created_at", order: "desc" },
      { column: "e.id", order: "desc" },
    ])
    .limit(5)
    .select(
      "e.id",
      "e.message",
      "e.status",
      "e.preferred_intake",
      "e.preferred_year",
      "e.created_at",
      "i.institution_name",
    );

  return { total: Number(countRow.count), recent };
}
