// Feed comments repository — feed_comments in the globalyapp (master) DB.
//
// Comments are addressed by their own id, but a page of them is always scoped to one post
// AND filtered on deleted_at, which is why the index in 20260817_400_feed_comments.ts leads
// with (post_id, deleted_at) before the keyset columns.

import { masterKnex } from "../../../core/db/master-pool.js";

export interface FeedCommentRow {
  id: number;
  post_id: number;
  author_platform_user_id: number;
  parent_comment_id: number | null;
  content: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type CommentCursor = { created_at: string; id: number };

/**
 * Same microsecond-faithful cursor discipline as the post timeline: the payload carries the
 * database's own `created_at::text`, never `new Date(...).toISOString()`, which truncates to
 * milliseconds and would silently skip a row created in the same millisecond as the cursor.
 *
 * Comments read oldest-first, so "after the cursor" is strictly GREATER — the mirror image of
 * the timeline. That ordering is also what makes the page stable under concurrent inserts: a
 * new comment always sorts after every cursor already issued, so it can only ever appear on a
 * later page, never shift an earlier one.
 */
export function encodeCommentCursor(row: { cursor_ts?: string; created_at: Date | string; id: number }): string {
  const payload: CommentCursor = {
    created_at: row.cursor_ts ?? new Date(row.created_at).toISOString(),
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCommentCursor(cursor: string): CommentCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed?.id !== "number" || typeof parsed?.created_at !== "string") return null;
    return { created_at: parsed.created_at, id: parsed.id };
  } catch {
    return null;
  }
}

/** The one query that produces a client-facing comment: author card plus server-decided authorship. */
function hydratedCommentQuery(viewerId: number) {
  return masterKnex("feed_comments as c")
    .leftJoin("platform_users as u", "u.id", "c.author_platform_user_id")
    .whereNull("c.deleted_at")
    .select(
      "c.id",
      "c.post_id",
      "c.author_platform_user_id",
      "c.parent_comment_id",
      "c.content",
      "c.created_at",
      "c.updated_at",
      // Microsecond-faithful copy of created_at, used only to build cursors. Stripped before the response.
      masterKnex.raw("c.created_at::text as cursor_ts"),
      "u.first_name as author_first_name",
      "u.last_name as author_last_name",
      "u.photo_url as author_photo_url",
      masterKnex.raw("(c.author_platform_user_id = ?) as is_mine", [viewerId]),
    );
}

export async function findCommentForViewer(id: number, viewerId: number) {
  return hydratedCommentQuery(viewerId).where("c.id", id).first() as Promise<
    (FeedCommentRow & Record<string, unknown>) | undefined
  >;
}

/** Oldest-first keyset page. Never OFFSET — see encodeCommentCursor. */
export async function listComments(input: {
  postId: number;
  viewerId: number;
  limit: number;
  cursor?: CommentCursor | null;
}) {
  const { postId, viewerId, limit, cursor } = input;

  const rows: (FeedCommentRow & Record<string, unknown>)[] = await hydratedCommentQuery(viewerId)
    .where("c.post_id", postId)
    .modify((qb) => {
      if (!cursor) return;
      qb.whereRaw("(c.created_at, c.id) > (?::timestamptz, ?)", [cursor.created_at, cursor.id]);
    })
    .orderBy([
      { column: "c.created_at", order: "asc" },
      { column: "c.id", order: "asc" },
    ])
    .limit(limit + 1); // one extra row tells us whether another page exists

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    comments: page,
    next_cursor: hasMore && page.length ? encodeCommentCursor(page[page.length - 1]) : null,
  };
}

/** Live row, ignoring the author card — used for the authorisation checks. */
export async function findComment(id: number) {
  return masterKnex("feed_comments").where({ id }).whereNull("deleted_at").first() as Promise<
    FeedCommentRow | undefined
  >;
}

/**
 * Insert and bump the post's counter in one transaction, so `comments_count` can never drift
 * from the rows it counts. Same discipline as reactions_count in feed.repository.ts, and the
 * reason the timeline needs no per-post COUNT(*).
 */
export async function insertComment(data: {
  post_id: number;
  author_platform_user_id: number;
  parent_comment_id: number | null;
  content: string;
}) {
  return masterKnex.transaction(async (trx) => {
    const [row] = await trx("feed_comments").insert(data).returning("id");
    await trx("feed_posts").where({ id: data.post_id }).increment("comments_count", 1);
    return row.id as number;
  });
}

export async function updateComment(id: number, content: string) {
  await masterKnex("feed_comments")
    .where({ id })
    .whereNull("deleted_at")
    .update({ content, updated_at: masterKnex.fn.now() });
}

/**
 * Soft delete. The `whereNull("deleted_at")` guard makes it idempotent at the row level: a
 * second delete updates nothing and therefore decrements nothing, so a double-tap cannot
 * drive the counter below the real number of live comments.
 */
export async function softDeleteComment(id: number, postId: number) {
  return masterKnex.transaction(async (trx) => {
    const deleted = await trx("feed_comments")
      .where({ id })
      .whereNull("deleted_at")
      .update({ deleted_at: trx.fn.now() });
    if (deleted > 0) {
      await trx("feed_posts")
        .where({ id: postId })
        // Clamped — a count can never go negative even if it drifted.
        .update({ comments_count: trx.raw("GREATEST(comments_count - 1, 0)") });
    }
    return deleted > 0;
  });
}
