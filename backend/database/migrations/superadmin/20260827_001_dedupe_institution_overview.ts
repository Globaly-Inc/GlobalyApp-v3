import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_institution_overview";
const MERGE_COLUMNS = [
  "name", "website", "phone", "email", "address", "city", "state", "country",
  "description", "logo_url", "source_url", "zip_code",
  "facebook_url", "instagram_url", "twitter_url", "linkedin_url", "youtube_url",
];

export async function up(knex: Knex): Promise<void> {
  const dupGroups: { job_id: string }[] = await knex(`${S}.${TABLE}`)
    .select("job_id")
    .groupBy("job_id")
    .havingRaw("count(id) > 1");

  for (const { job_id } of dupGroups) {
    const rows = await knex(`${S}.${TABLE}`).where({ job_id }).orderBy("created_at", "asc");
    const keep = rows.at(-1);
    const merged: Record<string, unknown> = {};
    for (const col of MERGE_COLUMNS) {
      merged[col] = rows.toReversed().map((r) => r[col]).find((v) => v != null && v !== "") ?? null;
    }
    await knex(`${S}.${TABLE}`).where({ id: keep.id }).update({ ...merged, updated_at: knex.fn.now() });
    await knex(`${S}.${TABLE}`).where({ job_id }).whereNot({ id: keep.id }).delete();
  }

  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.unique(["job_id"], { indexName: "extraction_institution_overview_job_id_uniq" });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropUnique(["job_id"], "extraction_institution_overview_job_id_uniq");
  });
}
