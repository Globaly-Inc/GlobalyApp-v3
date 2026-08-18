// Wave D4 — feed comments.
//
// PLACEMENT: master (public), next to feed_posts — NOT a tenant schema.
//
// A comment's two hard foreign keys are feed_posts and platform_users, both of
// which live in the master schema. The graph is cross-tenant by construction: a
// post authored by a member of business A is commented on by a student with no
// business at all, and by a member of business B. A cross-tenant FK cannot live
// inside one tenant's schema (§1.2, and the same reasoning that put
// service_branch_sharing in master), so `public` is the only placement that can
// hold the row at all.
//
// v1_id: nullable + UNIQUE. V1's feed_comments rows migrate in W5 as a Stage-2
// transform; carrying the source uuid makes that transform idempotent (upsert on
// v1_id) and keeps the V1→V3 audit trail. Comments authored in V3 leave it NULL,
// which is why it cannot be NOT NULL and why UNIQUE (not PK) is the right guard —
// Postgres allows many NULLs in a unique index.
//
// parent_comment_id: carried because V1 and V2 both have it (V2's commentRow
// exposes it), so W5 has somewhere to put the column. The API returns it as-is;
// it does not build a tree server-side. One nullable self-FK is cheaper than a
// lossy migration.
//
// comments_count on feed_posts: denormalised, maintained in the same transaction
// as the insert/delete — mirroring reactions_count from 20260811_009_feed.ts.
// The alternative is a correlated COUNT(*) per post on the timeline's hot path,
// i.e. an N+1 on the one query that must stay fast.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_posts", (t) => {
    t.integer("comments_count").notNullable().defaultTo(0);
  });

  await knex.schema.createTable("feed_comments", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("post_id").unsigned().notNullable().references("id").inTable("feed_posts").onDelete("CASCADE");
    t.integer("author_platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    // Self-FK. CASCADE so deleting a parent hard-deletes its replies — soft-delete
    // is the normal path, this only fires when a post (and its tree) is purged.
    t.integer("parent_comment_id").unsigned().nullable().references("id").inTable("feed_comments").onDelete("CASCADE");
    t.text("content").notNullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    // Exactly the columns the keyset page filters and orders on, in order.
    t.index(["post_id", "deleted_at", "created_at", "id"], "feed_comments_thread_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("feed_comments");
  await knex.schema.alterTable("feed_posts", (t) => {
    t.dropColumn("comments_count");
  });
}
