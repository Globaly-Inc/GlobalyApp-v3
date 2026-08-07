import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("audit_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("platform_user_id").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("action").notNullable();         // e.g. "business.created", "agent.invited", "profile.updated"
    t.text("entity_type").nullable();       // e.g. "business", "agent", "platform_user"
    t.text("entity_id").nullable();         // ID of the affected entity
    t.text("org_id").nullable();            // business schema_name if action was in business context
    t.jsonb("details").notNullable().defaultTo("{}");
    t.text("ip_address").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_audit_logs_user ON audit_logs (platform_user_id)");
  await knex.raw("CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id)");
  await knex.raw("CREATE INDEX idx_audit_logs_org ON audit_logs (org_id)");
  await knex.raw("CREATE INDEX idx_audit_logs_created ON audit_logs (created_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_logs");
}
