import type { Knex } from "knex";

// Admin-managed third-party credentials (Higgsfield, Google Search Console).
// Values are AES-256-GCM ciphertext (see shared/crypto/secret-box.ts) — never plaintext.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").createTable("integration_settings", (t) => {
    t.increments("id").primary();
    t.text("key").notNullable().unique();
    t.text("value").notNullable(); // encrypted
    t.integer("updated_by").nullable().references("id").inTable("superadmin.admin_users");
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("integration_settings");
}
