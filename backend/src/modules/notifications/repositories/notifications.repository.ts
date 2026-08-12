// Notifications — own rows only. Unread count is all the portal shell needs; the notifications page (list,
// mark-read, mark-all-read) belongs to its own epic.

import { masterKnex } from "../../../core/db/master-pool.js";

export async function unreadCountForUser(platformUserId: number): Promise<number> {
  const [row] = await masterKnex("notifications")
    .where({ platform_user_id: platformUserId })
    .whereNull("read_at")
    .count<{ count: string }[]>("* as count");
  return Number(row.count);
}
