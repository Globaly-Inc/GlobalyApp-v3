// Feed repository — feed_posts / feed_reactions in the globalyapp DB.
// Visibility is enforced HERE in the query, never in the client: V3 has no RLS, so the WHERE clause is the
// only thing standing between a private post and another user.

import { masterKnex } from "../../../core/db/master-pool.js";

export interface FeedPostRow {
  id: number;
  author_platform_user_id: number;
  business_id: number | null;
  post_type: string;
  visibility: string;
  content: string;
  media: { storage_path: string; type: "image" | "video"; mime_type: string }[];
  is_pinned: boolean;
  reactions_count: number;
  created_at: Date;
  updated_at: Date;
}

export type Cursor = { is_pinned: boolean; created_at: string; id: number };

/**
 * The cursor timestamp must be the database's own text form, NOT a JS Date.
 *
 * `new Date(...).toISOString()` truncates to milliseconds while Postgres stores microseconds, so for two
 * posts created in the same millisecond the keyset comparison would place the cursor at or ahead of a row
 * that should still come after it — and that row is silently skipped, never appearing on any page. Hence
 * `cursor_ts` (`created_at::text`) in the query below, cast straight back to timestamptz for the comparison.
 */
export function encodeCursor(post: { is_pinned: boolean; cursor_ts?: string; created_at: Date | string; id: number }): string {
  const payload: Cursor = {
    is_pinned: post.is_pinned,
    created_at: post.cursor_ts ?? new Date(post.created_at).toISOString(),
    id: post.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed?.id !== "number" || typeof parsed?.created_at !== "string") return null;
    return { is_pinned: !!parsed.is_pinned, created_at: parsed.created_at, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * The one query that produces a client-facing post: author card, business card, the viewer's own reaction,
 * and server-decided authorship.
 *
 * Both the timeline AND the create response go through this. Returning the bare inserted row from create
 * instead is what made a just-posted card render as "Someone" with no delete action until a reload — the two
 * responses had different shapes. Sharing the query makes that class of drift impossible.
 */
function hydratedPostQuery(viewerId: number) {
  return masterKnex("feed_posts as p")
    .leftJoin("platform_users as u", "u.id", "p.author_platform_user_id")
    .leftJoin("businesses as b", "b.id", "p.business_id")
    .leftJoin("feed_reactions as mine", function () {
      this.on("mine.post_id", "=", "p.id").andOn("mine.platform_user_id", "=", masterKnex.raw("?", [viewerId]));
    })
    .whereNull("p.deleted_at")
    .select(
      "p.id",
      "p.author_platform_user_id",
      "p.business_id",
      "p.post_type",
      "p.visibility",
      "p.content",
      "p.media",
      "p.is_pinned",
      "p.reactions_count",
      "p.created_at",
      // Microsecond-faithful copy of created_at, used only to build cursors. Stripped before the response.
      masterKnex.raw("p.created_at::text as cursor_ts"),
      "u.first_name as author_first_name",
      "u.last_name as author_last_name",
      "u.photo_url as author_photo_url",
      "b.business_name",
      "b.logo_url as business_logo_url",
      "mine.emoji as my_reaction",
      // Authorship is decided here, not inferred by the client. Deletion is still authorized server-side.
      masterKnex.raw("(p.author_platform_user_id = ?) as is_mine", [viewerId]),
    );
}

/** A single post in the same shape the timeline returns. */
export async function findPostForViewer(id: number, viewerId: number) {
  return hydratedPostQuery(viewerId).where("p.id", id).first() as Promise<
    (FeedPostRow & Record<string, unknown>) | undefined
  >;
}

/**
 * Timeline page. Keyset (not OFFSET) on the exact triple the ORDER BY uses, so a post inserted mid-
 * pagination can neither duplicate nor skip a row.
 *
 * Visibility:
 *   everyone → all authenticated users
 *   business → members of that business per user_business_index
 *   private  → the author only
 */
export async function listPosts(input: {
  viewerId: number;
  postType?: string;
  limit: number;
  cursor?: Cursor | null;
}) {
  const { viewerId, postType, limit, cursor } = input;

  const rows: (FeedPostRow & Record<string, unknown>)[] = await hydratedPostQuery(viewerId)
    .modify((qb) => {
      if (postType && postType !== "all") qb.where("p.post_type", postType);
    })
    .where((qb) => {
      qb.where("p.visibility", "everyone")
        .orWhere((own) => own.where("p.visibility", "private").andWhere("p.author_platform_user_id", viewerId))
        .orWhere((biz) =>
          biz.where("p.visibility", "business").whereIn(
            "p.business_id",
            masterKnex("user_business_index")
              .select("business_id")
              .where({ platform_user_id: viewerId })
              .whereNull("deleted_at"),
          ),
        );
    })
    .modify((qb) => {
      if (!cursor) return;
      // ORDER BY is_pinned DESC, created_at DESC, id DESC — so "after the cursor" means strictly lower.
      qb.whereRaw("(p.is_pinned, p.created_at, p.id) < (?, ?::timestamptz, ?)", [
        cursor.is_pinned,
        cursor.created_at,
        cursor.id,
      ]);
    })
    .orderBy([
      { column: "p.is_pinned", order: "desc" },
      { column: "p.created_at", order: "desc" },
      { column: "p.id", order: "desc" },
    ])
    .limit(limit + 1); // one extra row tells us whether another page exists

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { posts: page, next_cursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null };
}

export type ReactionGroup = {
  emoji: string;
  count: number;
  /** A few reactors for the avatar stack — not the full list. */
  reactors: { first_name: string | null; photo_url: string | null }[];
};

const MAX_REACTOR_AVATARS = 3;

/**
 * Reaction summaries for a page of posts: one query for all of them, grouped in memory.
 *
 * Per-post queries here would be an N+1 on the timeline's hot path.
 */
export async function reactionSummaries(postIds: number[]): Promise<Map<number, ReactionGroup[]>> {
  const summaries = new Map<number, ReactionGroup[]>();
  if (!postIds.length) return summaries;

  const rows = (await masterKnex("feed_reactions as r")
    .leftJoin("platform_users as u", "u.id", "r.platform_user_id")
    .whereIn("r.post_id", postIds)
    .orderBy("r.created_at", "asc")
    .select("r.post_id", "r.emoji", "u.first_name", "u.photo_url")) as {
    post_id: number;
    emoji: string;
    first_name: string | null;
    photo_url: string | null;
  }[];

  for (const row of rows) {
    const groups = summaries.get(row.post_id) ?? [];
    let group = groups.find((g) => g.emoji === row.emoji);
    if (!group) {
      group = { emoji: row.emoji, count: 0, reactors: [] };
      groups.push(group);
    }
    group.count++;
    if (group.reactors.length < MAX_REACTOR_AVATARS) {
      group.reactors.push({ first_name: row.first_name, photo_url: row.photo_url });
    }
    summaries.set(row.post_id, groups);
  }

  // Most-reacted emoji first, so the card leads with the dominant reaction.
  for (const groups of summaries.values()) groups.sort((a, b) => b.count - a.count);
  return summaries;
}

/**
 * Is the caller a member of this business? Needed to stop someone posting into a business feed they do not
 * belong to. Lives here rather than in a shared memberships repository so the feed owns the one query it
 * needs — user_business_index is a plain table, not another module's private state.
 */
export async function isBusinessMember(platformUserId: number, businessId: number): Promise<boolean> {
  const row = await masterKnex("user_business_index")
    .where({ platform_user_id: platformUserId, business_id: businessId })
    .whereNull("deleted_at")
    .first();
  return !!row;
}

export async function findPost(id: number) {
  return masterKnex("feed_posts").where({ id }).whereNull("deleted_at").first() as Promise<FeedPostRow | undefined>;
}

export async function insertPost(data: {
  author_platform_user_id: number;
  business_id: number | null;
  post_type: string;
  visibility: string;
  content: string;
  media: unknown[];
}) {
  const [row] = await masterKnex("feed_posts")
    .insert({ ...data, media: JSON.stringify(data.media) })
    .returning("*");
  return row as FeedPostRow;
}

export async function softDeletePost(id: number) {
  return masterKnex("feed_posts").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

/**
 * Add or update the caller's reaction.
 *
 * The count is NOT derived from the upsert's row count: `INSERT … ON CONFLICT DO UPDATE` reports 1 for both
 * a fresh insert and an emoji change, so that would wrongly increment on a re-react. Instead: lock the pair,
 * branch on whether it exists, and only increment for a genuinely new row. `DO NOTHING` plus the row count
 * closes the double-tap race where two requests both see "absent".
 */
export async function setReaction(postId: number, platformUserId: number, emoji: string) {
  return masterKnex.transaction(async (trx) => {
    const existing = await trx("feed_reactions")
      .where({ post_id: postId, platform_user_id: platformUserId })
      .forUpdate()
      .first();

    if (existing) {
      if (existing.emoji !== emoji) {
        await trx("feed_reactions").where({ post_id: postId, platform_user_id: platformUserId }).update({ emoji });
      }
      return { added: false };
    }

    const inserted = await trx("feed_reactions")
      .insert({ post_id: postId, platform_user_id: platformUserId, emoji })
      .onConflict(["post_id", "platform_user_id"])
      .ignore();

    // rowCount 0 → a concurrent request won the race and already counted it.
    const didInsert = (inserted as unknown as { rowCount?: number }).rowCount !== 0;
    if (didInsert) {
      await trx("feed_posts").where({ id: postId }).increment("reactions_count", 1);
    }
    return { added: didInsert };
  });
}

export async function removeReaction(postId: number, platformUserId: number) {
  return masterKnex.transaction(async (trx) => {
    const deleted = await trx("feed_reactions")
      .where({ post_id: postId, platform_user_id: platformUserId })
      .del();
    if (deleted > 0) {
      // Clamped — a count can never go negative even if it drifted.
      await trx("feed_posts")
        .where({ id: postId })
        .update({ reactions_count: masterKnex.raw("GREATEST(reactions_count - 1, 0)") });
    }
    return { removed: deleted > 0 };
  });
}
