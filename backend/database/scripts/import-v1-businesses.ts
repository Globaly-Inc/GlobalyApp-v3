// Loads V1 businesses into V3 and wires up the business portal:
//   businesses -> user_business_index -> per-tenant schema (agents).
//
//   node --import tsx database/scripts/import-v1-businesses.ts            # dry run
//   node --import tsx database/scripts/import-v1-businesses.ts --apply    # write
//   node --import tsx database/scripts/import-v1-businesses.ts --self-check
//
// Requires import-v1-users to have run first — owners are matched by V1 uuid.
// Only businesses with an accepted owner are migrated; V3's businesses.owner_id
// is NOT NULL, so an unclaimed directory listing has nothing to hang off.
//
// Tenant provisioning goes through the app's own provisionBusinessSchema(), so a
// migrated business is byte-identical to one created through /businesses/register.

import assert from "node:assert/strict";
import pg from "pg";

import { masterKnex } from "../../src/core/db/master-pool.js";
import { createSchemaKnex } from "../../src/core/db/knex.js";
import { provisionBusinessSchema } from "../../src/core/business/provisioner.js";
import { buildCountryResolver } from "./recon-v2-users.mjs";

// V1 business_members.role -> V3 tenant roles (see seeders/business/roles_seeder.ts,
// which seeds exactly: owner, admin, manager, counsellor, member).
const ROLE_MAP: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  staff: "member",
  member: "member",
  manager: "manager",
  counsellor: "counsellor",
};

interface V1Business {
  id: string;
  name: string;
  slug: string | null;
  business_type: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  instagram_url: string | null;
  status: string | null;
  verified_at: string | null;
  is_suspended: boolean | null;
  is_published: boolean | null;
  business_category_uuid: string | null;
  gallery_images: string[] | null;
  video_urls: string[] | null;
  registration_code: string | null;
  registration_licenses: unknown;
  postcode: string | null;
  youtube_url: string | null;
  whatsapp_url: string | null;
  default_currency: string | null;
  owner_uuid: string;
}

interface V1Member {
  business_id: string;
  user_uuid: string | null;
  role: string;
  invite_status: string;
  position: string | null;
  invited_by_uuid: string | null;
}

// ── Pure helpers (covered by --self-check) ──────────────────────────────────

/**
 * V3 subdomain is UNIQUE NOT NULL and ends up in a hostname, so it must be a
 * clean DNS label. V1 slugs are mostly there already but carry timestamp
 * suffixes and stray characters.
 */
export function toSubdomain(slug: string | null, name: string, fallbackId: string): string {
  const base = (slug || name || "").toLowerCase();
  const cleaned = base
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  // A label must start with a letter/digit and fit in 63 chars.
  const trimmed = cleaned.slice(0, 63).replace(/-+$/, "");
  return trimmed || `biz-${fallbackId.slice(0, 8)}`;
}

/** V1 suspension/status -> V3 account_status (1 = active, 0 = inactive). */
export function toAccountStatus(isSuspended: boolean | null): number {
  return isSuspended === true ? 0 : 1;
}

export function mapRole(v1Role: string): string | null {
  return ROLE_MAP[v1Role] ?? null;
}

/**
 * V1 stores a display label ("AUD - Australian Dollar"); V3 businesses.currency
 * holds the ISO-4217 code. The code is the label's prefix, so this narrows
 * rather than guesses; anything that is not a 3-letter code is kept verbatim.
 *
 * ponytail: duplicated from import-v1-users.mjs — that module runs main() on
 * import, so it cannot be imported as a library.
 */
export function toCurrencyCode(value: string | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const code = raw.split("-")[0].trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : raw;
}

// ── Load ────────────────────────────────────────────────────────────────────

async function fetchSource(v1: pg.Client) {
  const businesses = await v1.query<V1Business>(
    `SELECT b.id::text, b.name, b.slug, b.business_type, b.description, b.logo_url,
            b.cover_url, b.website, b.email, b.phone, b.country, b.state, b.city,
            b.address, b.linkedin_url, b.facebook_url, b.twitter_url, b.instagram_url,
            b.status, b.verified_at, b.is_suspended, b.is_published,
            b.business_category_id::text AS business_category_uuid,
            b.gallery_images, b.video_urls, b.registration_code,
            b.registration_licenses, b.postcode, b.youtube_url, b.whatsapp_url,
            b.default_currency,
            owner.user_id::text AS owner_uuid
       FROM public.businesses b
       JOIN LATERAL (
         SELECT bm.user_id
           FROM public.business_members bm
          WHERE bm.business_id = b.id
            AND bm.role = 'owner'
            AND bm.invite_status = 'accepted'
            AND bm.user_id IS NOT NULL
          ORDER BY bm.joined_at NULLS LAST
          LIMIT 1
       ) owner ON true
      ORDER BY b.name`,
  );

  const members = await v1.query<V1Member>(
    `SELECT business_id::text, user_id::text AS user_uuid, role::text, invite_status,
            nullif(btrim(position), '') AS position,
            invited_by::text AS invited_by_uuid
       FROM public.business_members
      WHERE user_id IS NOT NULL AND invite_status = 'accepted'`,
  );

  // V1 category uuid -> slug, so it can be remapped onto the V3 serial id.
  const categories = await v1.query<{ id: string; slug: string }>(
    `SELECT id::text, lower(btrim(slug)) AS slug FROM public.business_categories WHERE slug IS NOT NULL`,
  );

  const unlinked = await v1.query(
    `SELECT business_id::text, coalesce(invite_email,'(none)') AS invite_email,
            role::text, invite_status
       FROM public.business_members
      WHERE user_id IS NULL OR invite_status <> 'accepted'`,
  );

  return {
    businesses: businesses.rows,
    members: members.rows,
    unlinked: unlinked.rows,
    categories: categories.rows,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

function selfCheck() {
  assert.equal(toSubdomain("apic-melbourne-1775621966164", "APIC Melbourne", "x"), "apic-melbourne-1775621966164");
  assert.equal(toSubdomain(null, "Asia Pacific International College (APIC)", "x"), "asia-pacific-international-college-apic");
  assert.equal(toSubdomain("Stanley College  ", "Stanley", "x"), "stanley-college");
  assert.equal(toSubdomain("--weird--", "n", "x"), "weird");
  // Never returns an empty label.
  assert.equal(toSubdomain("", "", "abcdef1234"), "biz-abcdef12");
  assert.equal(toSubdomain("!!!", "", "abcdef1234"), "biz-abcdef12");
  assert.ok(toSubdomain("a".repeat(200), "n", "x").length <= 63);

  assert.equal(toAccountStatus(true), 0);
  assert.equal(toAccountStatus(false), 1);
  assert.equal(toAccountStatus(null), 1);

  assert.equal(mapRole("staff"), "member");
  assert.equal(mapRole("owner"), "owner");
  assert.equal(mapRole("nonsense"), null);

  assert.equal(toCurrencyCode("AUD - Australian Dollar"), "AUD");
  assert.equal(toCurrencyCode("npr"), "NPR");
  assert.equal(toCurrencyCode(""), null);
  assert.equal(toCurrencyCode(null), null);
  // Not a 3-letter code: kept verbatim rather than silently dropped.
  assert.equal(toCurrencyCode("Australian Dollar"), "Australian Dollar");

  console.log("self-check: all assertions passed");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) {
    selfCheck();
    await masterKnex.destroy();
    return;
  }

  const apply = args.includes("--apply");
  const v1Url = process.env.V1_DATABASE_URL;
  if (!v1Url) {
    console.error("V1_DATABASE_URL is not set (the restored V1 database).");
    process.exit(2);
  }

  const v1 = new pg.Client({ connectionString: v1Url });
  await v1.connect();
  await v1.query("SET default_transaction_read_only = on");

  const report = {
    businesses: [] as string[],
    skippedBusinesses: [] as { name: string; reason: string }[],
    memberships: 0,
    agents: 0,
    skippedMembers: [] as { business: string; reason: string }[],
    provisioned: [] as string[],
    unresolvedCategories: [] as { business: string; value: string }[],
    unresolvedInviters: [] as { business: string; value: string }[],
    published: 0,
  };

  try {
    const { businesses, members, unlinked, categories } = await fetchSource(v1);
    console.log(`source: ${businesses.length} businesses with an accepted owner, ${members.length} accepted memberships`);
    console.log(apply ? "mode: APPLY (writing)\n" : "mode: DRY RUN (no writes, no schemas)\n");

    const countries = await masterKnex("countries").select("id", "name", "iso2", "iso3");
    const resolveCountry = buildCountryResolver(countries);

    // uuid -> platform_users.id, from the user import that preceded this.
    const users = await masterKnex("platform_users").select("id", "uuid");
    const userIdByUuid = new Map<string, number>(users.map((u) => [u.uuid, u.id]));

    // V1 category uuid -> V3 serial id, bridged by the natural key `slug`.
    const v3Categories = await masterKnex("business_categories").whereNull("deleted_at").select("id", "slug");
    const categoryIdBySlug = new Map<string, number>(
      v3Categories.map((c) => [String(c.slug).trim().toLowerCase(), c.id]),
    );
    const categoryIdByUuid = new Map<string, number>();
    for (const c of categories) {
      const id = categoryIdBySlug.get(c.slug);
      if (id !== undefined) categoryIdByUuid.set(c.id, id);
    }

    const membersByBusiness = new Map<string, V1Member[]>();
    for (const m of members) {
      if (!membersByBusiness.has(m.business_id)) membersByBusiness.set(m.business_id, []);
      membersByBusiness.get(m.business_id)!.push(m);
    }

    for (const b of businesses) {
      const ownerId = userIdByUuid.get(b.owner_uuid);
      if (!ownerId) {
        report.skippedBusinesses.push({ name: b.name, reason: "owner not found in platform_users" });
        continue;
      }

      const subdomain = toSubdomain(b.slug, b.name, b.id);

      const categoryId = b.business_category_uuid
        ? (categoryIdByUuid.get(b.business_category_uuid) ?? null)
        : null;
      if (b.business_category_uuid && categoryId === null) {
        report.unresolvedCategories.push({ business: b.name, value: b.business_category_uuid });
      }
      if (b.is_published === true) report.published++;

      const values = {
        owner_id: ownerId,
        subdomain,
        business_name: b.name,
        business_type: b.business_type,
        description: b.description,
        logo_url: b.logo_url,
        cover_url: b.cover_url,
        website: b.website,
        email: b.email,
        phone: b.phone,
        country_id: resolveCountry(b.country),
        state: b.state,
        city: b.city,
        address: b.address,
        linkedin_url: b.linkedin_url,
        facebook_url: b.facebook_url,
        twitter_url: b.twitter_url,
        instagram_url: b.instagram_url,
        status: b.status ?? "pending",
        verified_at: b.verified_at,
        account_status: toAccountStatus(b.is_suspended),
        // V1 already had an explicit publish flag; carrying it verbatim is the
        // only mapping that does not invent visibility the operator never set.
        is_published: b.is_published === true,
        business_category_id: categoryId,
        business_registration_number: b.registration_code,
        registration_licenses: b.registration_licenses === null ? null : JSON.stringify(b.registration_licenses),
        postcode: b.postcode,
        youtube_url: b.youtube_url,
        whatsapp_url: b.whatsapp_url,
        gallery_images: b.gallery_images,
        video_urls: b.video_urls,
        currency: toCurrencyCode(b.default_currency),
        meta: JSON.stringify({ v1_business_id: b.id }),
      };

      if (!apply) {
        report.businesses.push(`${b.name} -> ${subdomain}`);
        const mem = membersByBusiness.get(b.id) ?? [];
        report.memberships += mem.length;
        report.agents += mem.filter((m) => userIdByUuid.has(m.user_uuid!) && mapRole(m.role)).length;
        continue;
      }

      // Idempotent on subdomain — the natural key a re-run would collide on.
      // Every mapped column is merged, so a re-run after a mapping change repairs
      // existing rows instead of leaving them on the old shape.
      const [row] = await masterKnex("businesses")
        .insert(values)
        .onConflict("subdomain")
        .merge({ ...values, updated_at: masterKnex.fn.now() })
        .returning(["id", "schema_name"]);

      report.businesses.push(`${b.name} -> ${subdomain}`);

      // Tenant schema: roles/agents/permissions. Safe to re-run (CREATE SCHEMA IF
      // NOT EXISTS + knex migrations are tracked per schema).
      await provisionBusinessSchema(row.schema_name);
      report.provisioned.push(subdomain);

      const tenant = createSchemaKnex(row.schema_name, { min: 0, max: 1 });
      try {
        const roles = await tenant("roles").select("id", "name");
        const roleIdByName = new Map<string, number>(roles.map((r) => [r.name, r.id]));

        // agents.added_by is a self-FK, so inviters can only be resolved once
        // every agent row in this schema exists — collected here, applied below.
        const agentIdByUserId = new Map<number, number>();
        const pendingInvites: { agentUserId: number; inviterUuid: string }[] = [];

        for (const m of membersByBusiness.get(b.id) ?? []) {
          const memberUserId = userIdByUuid.get(m.user_uuid!);
          const roleName = mapRole(m.role);
          if (!memberUserId || !roleName) {
            report.skippedMembers.push({
              business: b.name,
              reason: !memberUserId ? `user ${m.user_uuid} not imported` : `unmapped role ${m.role}`,
            });
            continue;
          }
          const isOwner = m.role === "owner";

          await masterKnex("user_business_index")
            .insert({ platform_user_id: memberUserId, business_id: row.id, role: roleName, is_owner: isOwner })
            .onConflict(["platform_user_id", "business_id"])
            .merge({ role: roleName, is_owner: isOwner });
          report.memberships++;

          // V1 business_members.position is a free-text job title with no V3
          // column; it rides on agents.meta rather than being dropped.
          const meta = JSON.stringify(m.position ? { position: m.position } : {});
          const [agentRow] = await tenant("agents")
            .insert({
              platform_user_id: memberUserId,
              role_id: roleIdByName.get(roleName)!,
              is_owner: isOwner,
              account_status: 1,
              meta,
            })
            .onConflict("platform_user_id")
            .merge({ role_id: roleIdByName.get(roleName)!, is_owner: isOwner, meta, updated_at: masterKnex.fn.now() })
            .returning(["id"]);
          agentIdByUserId.set(memberUserId, agentRow.id);
          if (m.invited_by_uuid) pendingInvites.push({ agentUserId: memberUserId, inviterUuid: m.invited_by_uuid });
          report.agents++;
        }

        // Second pass: V1 invited_by (auth.users uuid) -> this schema's agents.id.
        // agents.added_by is a self-FK, so the inviter must already have a row.
        for (const inv of pendingInvites) {
          const inviterUserId = userIdByUuid.get(inv.inviterUuid);
          const inviterAgentId = inviterUserId ? agentIdByUserId.get(inviterUserId) : undefined;
          if (!inviterAgentId) {
            report.unresolvedInviters.push({ business: b.name, value: inv.inviterUuid });
            continue;
          }
          await tenant("agents")
            .where({ platform_user_id: inv.agentUserId })
            .update({ added_by: inviterAgentId });
        }
      } finally {
        await tenant.destroy();
      }
    }

    console.log(`businesses:  ${report.businesses.length}`);
    for (const b of report.businesses) console.log(`   ${b}`);
    console.log(`published:   ${report.published}`);
    console.log(`memberships: ${report.memberships}`);
    console.log(`agents:      ${report.agents}`);
    if (apply) console.log(`provisioned schemas: ${report.provisioned.length}`);
    if (report.skippedBusinesses.length) {
      console.log("skipped businesses:");
      for (const s of report.skippedBusinesses) console.log(`   ${s.name}: ${s.reason}`);
    }
    if (report.skippedMembers.length) {
      console.log("skipped members:");
      for (const s of report.skippedMembers) console.log(`   ${s.business}: ${s.reason}`);
    }
    if (report.unresolvedCategories.length) {
      console.log("UNRESOLVED business_category_id (stored as NULL):");
      for (const c of report.unresolvedCategories) console.log(`   ${c.business}: ${c.value}`);
    }
    if (report.unresolvedInviters.length) {
      console.log("UNRESOLVED invited_by (agents.added_by left NULL):");
      for (const c of report.unresolvedInviters) console.log(`   ${c.business}: ${c.value}`);
    }
    console.log(`\nnot migrated (no accepted owner / no linked user): ${unlinked.length} membership rows,` +
      ` ${55 - businesses.length} unclaimed directory businesses`);
    if (!apply) console.log("nothing was written — re-run with --apply");
  } finally {
    await v1.end().catch(() => {});
    await masterKnex.destroy().catch(() => {});
  }
}

await main();
