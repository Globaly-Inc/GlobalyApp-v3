import type { Knex } from "knex";

// Who this tenant has mailed their widget code to.
//
// Deliberately the SAME table name as the business template (business/20261005_001), for the same
// reason ai_widget_visitors is: a business and an institution hand their code over the same way,
// and the schema this lives in is what makes the rows theirs.
//
// Why the tenant schema rather than globalyapp: this is the tenant's own address book of the
// people who look after their website — their record, not platform infrastructure. The cost is
// that the link to ai_embed_configs is app-level with no FK across schemas (same as
// ai_widget_visitors), so nothing cascades: deleting a widget leaves its recipient list behind.
//
// These people are NOT users of the org. An earlier version invited them in as a `developer`
// agent with a GlobalyApp login; they are agencies and contractors who paste a script tag, so the
// whole record is an address and when the code last went to it.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ai_embed_developers", (t) => {
    t.increments("id").primary();
    t.integer("ai_embed_config_id").notNullable(); // app-level FK to globalyapp.ai_embed_configs.id
    // Lower-cased by the request schema before it ever reaches here, so the unique index below
    // actually dedupes rather than storing Dev@x.com beside dev@x.com.
    t.text("email").notNullable();
    t.timestamp("last_sent_at", { useTz: true }).nullable();
    t.integer("send_count").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.unique(["ai_embed_config_id", "email"], { indexName: "ai_embed_developers_config_email_uniq" });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_embed_developers");
}
