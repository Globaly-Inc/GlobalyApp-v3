// Notifications — MASTER schema.
//
// PLACEMENT: a notification is addressed to a platform_user, never to a tenant.
// The same user belongs to any number of businesses and to none, so a per-tenant
// copy would fragment one person's inbox across schemas and make
// personal/notifications an N-schema fan-out. FK is platform_users, so master.
//
// Rebuilt to V2's design: per-user preferences × delivery channels
// (user-prefs.ts), an FCM device-token registry keyed on the token itself
// (push-tokens.ts), and read state on the notification row.
//
// FAN-OUT IS NOT SYNCHRONOUS. A request publishes one message; the worker
// (src/workers/notification.worker.ts) materialises rows. Idempotency is
// structural, not conditional: notifications is UNIQUE on
// (platform_user_id, dedupe_key) and notification_deliveries is UNIQUE on
// (notification_id, channel), so a redelivered message inserts nothing twice.

import type { Knex } from "knex";

const CHANNELS = ["in_app", "email", "push"] as const;

export async function up(knex: Knex): Promise<void> {
  // ── notifications (V1: 16 rows — loaded by the content wave, not by D3) ──
  await knex.schema.createTable("notifications", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    // Deliberately unconstrained text: every wave adds its own types (D1
    // enquiries, D2 messages, D3 events). A CHECK here would force other lanes
    // to edit this migration, which §1.2 forbids.
    t.text("type").notNullable();
    t.text("title").notNullable();
    t.text("body").nullable();
    t.text("reference_type").nullable();
    // text, not uuid: V1 references were uuids, V3 primary keys are integers.
    t.text("reference_id").nullable();
    /** Publisher-supplied idempotency key. The worker's whole replay defence. */
    t.text("dedupe_key").notNullable();
    // V1 carried a boolean is_read; read_at answers the same question and says when.
    t.timestamp("read_at", { useTz: true }).nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.unique(["platform_user_id", "dedupe_key"], { indexName: "notifications_dedupe_unique" });
    t.index(["platform_user_id", "read_at", "id"], "notifications_inbox_idx");
  });

  // ── notification_preferences — one row per (user, type, channel) ──
  // Absence means "use the default" (see consts.ts), so a brand-new user needs
  // no backfill and a new notification type needs no migration.
  await knex.schema.createTable("notification_preferences", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("notification_type").notNullable();
    t.text("channel").notNullable().checkIn([...CHANNELS], "notification_preferences_channel_check");
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["platform_user_id", "notification_type", "channel"], {
      indexName: "notification_preferences_unique",
    });
  });

  // ── notification_deliveries — per-channel dispatch state, and the worker's idempotency key ──
  await knex.schema.createTable("notification_deliveries", (t) => {
    t.increments("id").primary();
    t.integer("notification_id").unsigned().notNullable()
      .references("id").inTable("notifications").onDelete("CASCADE");
    t.text("channel").notNullable().checkIn([...CHANNELS], "notification_deliveries_channel_check");
    t.text("status").notNullable().defaultTo("pending")
      .checkIn(["pending", "sent", "skipped", "failed"], "notification_deliveries_status_check");
    t.integer("attempts").notNullable().defaultTo(0);
    t.text("error").nullable();
    t.timestamp("sent_at", { useTz: true }).nullable();
    t.timestamps(true, true);
    t.unique(["notification_id", "channel"], { indexName: "notification_deliveries_unique" });
  });

  // ── push_tokens — FCM device registry (V2 push-tokens.ts) ──
  // UNIQUE on the token, not on (user, token): FCM tokens are device-scoped, so
  // re-registering on a shared device must MOVE the token to the new user.
  await knex.schema.createTable("push_tokens", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("token").notNullable().unique();
    t.text("user_agent").nullable();
    t.timestamp("last_seen_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["platform_user_id"], "push_tokens_user_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("push_tokens");
  await knex.schema.dropTableIfExists("notification_deliveries");
  await knex.schema.dropTableIfExists("notification_preferences");
  await knex.schema.dropTableIfExists("notifications");
}
