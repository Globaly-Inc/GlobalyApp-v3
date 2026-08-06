import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").createTable("admin_audit_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("admin_id").notNullable().references("id").inTable("superadmin.admin_users");
    t.text("action").notNullable();
    t.text("entity_type").nullable();
    t.uuid("entity_id").nullable();
    t.jsonb("details").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_admin_audit_logs_admin
      ON superadmin.admin_audit_logs (admin_id)
  `);
  await knex.raw(`
    CREATE INDEX idx_admin_audit_logs_entity
      ON superadmin.admin_audit_logs (entity_type, entity_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("admin_audit_logs");
}
