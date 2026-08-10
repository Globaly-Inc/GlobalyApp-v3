import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("uploaded_files", (t) => {
    t.increments("id").primary();
    t.integer("uploaded_by").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("entity_type").notNullable();   // platform_user, business, institution, agent
    t.text("entity_id").notNullable();     // uuid of the owning entity
    t.text("category").notNullable();      // profile, logo, cover, gallery, document
    t.text("original_name").notNullable(); // original filename from client
    t.text("storage_path").notNullable().unique(); // relative path in GCS bucket
    t.text("mime_type").notNullable();
    t.bigInteger("size_bytes").notNullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  // Look up files by entity
  await knex.schema.raw(
    "CREATE INDEX idx_uploaded_files_entity ON uploaded_files (entity_type, entity_id)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("uploaded_files");
}
