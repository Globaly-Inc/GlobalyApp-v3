// Favorites — Home needs only the count. Save/unsave and the Favorites page belong to their own epic;
// the table exists now because the count needs a schema to count.

import { masterKnex } from "../../../core/db/master-pool.js";

export async function countForUser(platformUserId: number): Promise<number> {
  const [row] = await masterKnex("user_favorites")
    .where({ platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .count<{ count: string }[]>("* as count");
  return Number(row.count);
}
