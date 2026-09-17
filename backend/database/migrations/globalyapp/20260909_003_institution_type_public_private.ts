import type { Knex } from "knex";

const CHECK = "institutions_institution_type_check";

/**
 * institution_type is the ownership sector — Public or Private — and the institutions search
 * filter offers whatever distinct values this column holds. It used to carry free-text
 * categories ("University", "Vocational Institute"), which nothing can map onto a sector.
 *
 * Rather than guess, the outgoing value is parked in `meta.legacy_institution_type` — the same
 * jsonb the promoter already uses for provenance — so the drop is reversible and an admin can
 * still see what a listing used to be called. NULL stays legal: a check constraint passes on
 * NULL, and an unclassified institution simply appears under neither filter option.
 *
 * Only `onboardInstitution` writes this column, and its payload schema is narrowed to the same
 * two values. The extraction contract's `institution_type` ("university|college|tafe|…") is a
 * different column — `superadmin.extraction_site_intelligence.institution_type` — which promote
 * never copies here, so the constraint cannot fail a promote.
 */
export async function up(knex: Knex): Promise<void> {
  await knex("institutions")
    .whereNotNull("institution_type")
    .whereRaw("initcap(lower(institution_type)) not in ('Public', 'Private')")
    .update({
      meta: knex.raw(
        "coalesce(meta, '{}'::jsonb) || jsonb_build_object('legacy_institution_type', institution_type)",
      ),
    });

  await knex("institutions")
    .whereNotNull("institution_type")
    .update({ institution_type: knex.raw("initcap(lower(institution_type))") });

  await knex("institutions")
    .whereNotIn("institution_type", ["Public", "Private"])
    .update({ institution_type: null });

  await knex.schema.alterTable("institutions", (t) => {
    t.check("institution_type in ('Public', 'Private')", undefined, CHECK);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Constraint first: the parked categories violate it, so they cannot go back before it goes.
  await knex.schema.alterTable("institutions", (t) => {
    t.dropChecks([CHECK]);
  });

  await knex("institutions")
    .whereRaw("meta ->> 'legacy_institution_type' is not null")
    .update({
      institution_type: knex.raw("meta ->> 'legacy_institution_type'"),
      meta: knex.raw("meta - 'legacy_institution_type'"),
    });
}
