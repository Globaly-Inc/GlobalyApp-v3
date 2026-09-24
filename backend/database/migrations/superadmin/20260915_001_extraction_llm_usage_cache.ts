import type { Knex } from "knex";

const S = "superadmin";

// Steps 1 and 2 of docs/data-extraction/2026-09-15-extraction-cost-reduction-design.md.
//
// extraction_llm_usage — one row per model call. Until now the only cost signal was a log line
// per call and the monthly invoice; nothing summed either into a per-job number. Tokens, not
// dollars: prices change per model and per month, so money is computed at read time from
// LLM_MODEL_PRICES, and a model with no price shows tokens rather than a wrong figure.
//
// extraction_llm_cache — the model's answer keyed on the exact input. The prompt string already
// carries the truncated page, the job's guidance notes, the site intelligence and the
// Save-and-Learn addendum, so sha256(model + system + prompt) is a complete key: edit a prompt
// template and only the affected inputs recompute; learn a lesson for one domain and only that
// domain re-pays. No prompt_version constant to forget to bump. Shared across jobs on purpose —
// two institutions publishing an identical page (mirrored handbooks, franchised campuses) get
// one answer, and nothing in this pipeline is tenant data.
//
// job_id on a cache row is the FIRST payer, kept only so a per-domain purge has a join path.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).createTable("extraction_llm_usage", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    // No FK: a usage row must survive its job being deleted (the money was still spent), and
    // calls made outside any job (the institution lookup service) have no job at all.
    t.uuid("job_id").nullable();
    t.text("kind").notNullable();
    t.text("model").notNullable();
    t.integer("prompt_tokens").notNullable().defaultTo(0);
    t.integer("output_tokens").notNullable().defaultTo(0);
    t.integer("cached_tokens").notNullable().defaultTo(0);
    t.boolean("cache_hit").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX idx_extraction_llm_usage_job ON ${S}.extraction_llm_usage (job_id, created_at)`);

  await knex.schema.withSchema(S).createTable("extraction_llm_cache", (t) => {
    t.text("input_hash").primary();
    t.text("model").notNullable();
    t.jsonb("result").notNullable();
    t.uuid("job_id").nullable();
    t.integer("prompt_tokens").notNullable().defaultTo(0);
    t.integer("output_tokens").notNullable().defaultTo(0);
    t.integer("hit_count").notNullable().defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_hit_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  // Purge path: rows nobody has asked for in a year.
  await knex.raw(`CREATE INDEX idx_extraction_llm_cache_last_hit ON ${S}.extraction_llm_cache (last_hit_at)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).dropTableIfExists("extraction_llm_cache");
  await knex.schema.withSchema(S).dropTableIfExists("extraction_llm_usage");
}
