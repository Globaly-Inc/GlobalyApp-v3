// Public profile slugs for the two org tables (Wave C2b).
//
// WHY A COLUMN AND NOT A DERIVED VALUE
// V1 and V2 both addressed public org profiles by a stored `businesses.slug`
// (V1 `/institution/:slug` → `businesses_public.slug`; V2 `GET /institutions/:slug`),
// generated in application code as slugify(name) + a uniquifier. V3 had no
// equivalent, so an org had no stable public URL at all.
//
// It has to be stored rather than computed from the name on every read, because a
// slug that moves when an org renames itself invalidates every inbound link, every
// sitemap entry and every canonical tag that ever pointed at it. Stored once,
// never recomputed, is the whole point.
//
// WHY THE SUFFIX IS THE PRIMARY KEY
// `slugify(name)` collides for real ("APIC Melbourne" twice). Appending the org's
// own id, prefixed by the table it lives in — "b" for businesses, "i" for
// institutions — makes the value unique by construction across BOTH tables, which
// matters because /catalog/institutions/:slug resolves against either one. No
// retry loop, no uniqueness probe, no race: ids are unique and never change, so
// the derivation is deterministic and collision-safe on its own. The unique index
// below is a guard against a hand-set duplicate, not the mechanism.
//
// WHY A TRIGGER AND NOT APPLICATION CODE
// Orgs are inserted from several places (business onboarding, superadmin
// creation, the extraction promote path, the V1 loader) and more will follow. One
// BEFORE INSERT trigger covers every writer; a "remember to set slug" convention
// fails silently the first time somebody forgets, and the failure mode is an org
// with no public URL. Mirrors the trigger-maintained projection in
// 20260817_003_catalog_services.ts.
//
// The trigger only fires when slug IS NULL, so the V1→V3 data migration can carry
// a row's original V1 slug across verbatim and keep those URLs — and their search
// rankings — resolving after cutover.

import type { Knex } from "knex";

/** table → [slug prefix, the column holding the display name] */
const ORG_TABLES: Record<string, [prefix: string, nameColumn: string]> = {
  businesses: ["b", "business_name"],
  institutions: ["i", "institution_name"],
};

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    create or replace function public.org_public_slug(p_name text, p_prefix text, p_id integer)
    returns text
    language sql
    immutable
    as $$
      select coalesce(
               nullif(trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), ''),
               'org'
             ) || '-' || p_prefix || p_id::text
    $$;
  `);

  // The name column is read through to_jsonb(new) rather than named directly:
  // plpgsql plans the whole expression, so a literal new.business_name would fail
  // to resolve on the institutions trigger even inside an untaken branch.
  await knex.raw(`
    create or replace function public.set_org_public_slug()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.slug is null then
        new.slug := public.org_public_slug(to_jsonb(new) ->> tg_argv[1], tg_argv[0], new.id);
      end if;
      return new;
    end;
    $$;
  `);

  for (const [table, [prefix, nameColumn]] of Object.entries(ORG_TABLES)) {
    await knex.schema.alterTable(table, (t) => {
      t.text("slug").nullable();
    });

    await knex.raw(
      `update ?? set slug = public.org_public_slug(??, ?, id) where slug is null`,
      [table, nameColumn, prefix],
    );

    await knex.schema.alterTable(table, (t) => {
      t.unique(["slug"], { indexName: `${table}_slug_unique` });
    });

    // CREATE TRIGGER takes no bind parameters, so the two arguments are inlined.
    // Both are constants from ORG_TABLES above — never request input.
    await knex.raw(`
      create trigger ${table}_set_public_slug
        before insert on public.${table}
        for each row
        execute function public.set_org_public_slug('${prefix}', '${nameColumn}');
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of Object.keys(ORG_TABLES)) {
    await knex.raw(`drop trigger if exists ${table}_set_public_slug on ??`, [table]);
    await knex.schema.alterTable(table, (t) => {
      t.dropUnique(["slug"], `${table}_slug_unique`);
      t.dropColumn("slug");
    });
  }
  await knex.raw("drop function if exists public.set_org_public_slug()");
  await knex.raw("drop function if exists public.org_public_slug(text, text, integer)");
}
