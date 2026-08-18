// Ambassador engagement: inquiries, chat threads, messages, reviews. Wave G4.
//
// Spec: V2 routes/business-ambassador-engagement.ts + routes/ambassador-chat.ts
// for the column set, and V1 `process-ambassador-timeout` for the state machine:
//   pending → matched (expires_at = now + 5 min)
//           → accepted → in_progress → resolved
//           → (expired) re-matched to the next ambassador, or escalated when the
//             program has nobody else online.
// `expires_at` is what the timeout worker claims on, so it is indexed together
// with `status`.

import type { Knex } from "knex";

const INQUIRY_STATUSES = [
  "pending",
  "matched",
  "accepted",
  "in_progress",
  "resolved",
  "escalated",
  "closed",
] as const;

const SENDER_TYPES = ["prospect", "ambassador"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ambassador_inquiries", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("ambassador_programs").onDelete("CASCADE");
    // Null while unmatched, and re-pointed by the timeout worker on a reroute.
    t.integer("ambassador_id").unsigned().nullable()
      .references("id").inTable("ambassadors").onDelete("SET NULL");
    t.integer("prospect_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...INQUIRY_STATUSES], "ambassador_inquiries_status_check");
    t.text("first_message").notNullable();
    // V1 read `inquiry_context->country_of_origin` when picking the next match.
    t.jsonb("inquiry_context").notNullable().defaultTo("{}");

    t.timestamp("matched_at").nullable();
    t.timestamp("expires_at").nullable();
    t.timestamp("accepted_at").nullable();
    t.timestamp("resolved_at").nullable();
    t.timestamp("escalated_at").nullable();
    t.timestamps(true, true);

    t.index(["program_id", "status"], "ambassador_inquiries_program_status_idx");
    t.index(["ambassador_id", "status"], "ambassador_inquiries_ambassador_status_idx");
    t.index(["prospect_id"], "ambassador_inquiries_prospect_idx");
    // The timeout worker's claim predicate.
    t.index(["status", "expires_at"], "ambassador_inquiries_timeout_idx");
  });

  await knex.schema.createTable("ambassador_threads", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    // Exactly one thread per inquiry — this UNIQUE is what makes get-or-create
    // safe under concurrency instead of a read-then-insert race.
    t.integer("inquiry_id").unsigned().notNullable().unique()
      .references("id").inTable("ambassador_inquiries").onDelete("CASCADE");
    // platform_users ids. Derived server-side from the inquiry, never client-sent.
    t.specificType("participants", "integer[]").notNullable().defaultTo("{}");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("ambassador_messages", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("thread_id").unsigned().notNullable()
      .references("id").inTable("ambassador_threads").onDelete("CASCADE");
    t.integer("sender_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("sender_type").notNullable()
      .checkIn([...SENDER_TYPES], "ambassador_messages_sender_type_check");
    t.text("message_text").notNullable();
    // V1 `analyze-ambassador-sentiment` wrote these. No LLM key exists in this
    // deployment, so nothing sets them yet; the digest already reads them.
    t.boolean("flagged").notNullable().defaultTo(false);
    t.text("flag_reason").nullable();
    t.timestamp("read_at").nullable();
    t.timestamps(true, true);

    t.index(["thread_id", "created_at"], "ambassador_messages_thread_created_idx");
    t.index(["flagged", "created_at"], "ambassador_messages_flagged_idx");
  });

  await knex.schema.createTable("ambassador_reviews", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("ambassador_id").unsigned().notNullable()
      .references("id").inTable("ambassadors").onDelete("CASCADE");
    // One review per resolved inquiry.
    t.integer("inquiry_id").unsigned().nullable().unique()
      .references("id").inTable("ambassador_inquiries").onDelete("SET NULL");
    t.integer("reviewer_id").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    t.integer("overall_rating").notNullable();
    t.integer("responsiveness_rating").nullable();
    t.integer("helpfulness_rating").nullable();
    t.integer("knowledge_rating").nullable();
    t.integer("friendliness_rating").nullable();
    t.text("review_text").nullable();
    t.boolean("is_public").notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.index(["ambassador_id", "is_public"], "ambassador_reviews_ambassador_public_idx");
    t.check("overall_rating BETWEEN 1 AND 5", [], "ambassador_reviews_overall_range_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ambassador_reviews");
  await knex.schema.dropTableIfExists("ambassador_messages");
  await knex.schema.dropTableIfExists("ambassador_threads");
  await knex.schema.dropTableIfExists("ambassador_inquiries");
}
