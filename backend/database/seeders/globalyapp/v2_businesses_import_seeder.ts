import type { Knex } from "knex";
import v2Rows from "./data/v2-businesses.json";

// One-off import of manually-added V2 listings (public.businesses dump, 2026-08-24).
//
// Routing mirrors promote.service.ts: institutions vs businesses by type, and everything
// lands unclaimed/ownerless — the V2 dump has no contact-person names, so no owner and no
// tenant schema is created here. The schema is provisioned when someone accepts a claim,
// same as promoted extraction listings.
//
// Idempotent on subdomain (the V2 slug, unique in the dump): re-running skips existing rows.

type V2Row = Record<string, string | undefined>;

/** V2 gallery_urls is [{url,type,fileName}] — split into v3's text[] columns by type. */
function splitGallery(raw?: string): { images: string[]; videos: string[] } {
  const items: Array<{ url: string; type: string }> = raw ? JSON.parse(raw) : [];
  return {
    images: items.filter((i) => i.type !== "video").map((i) => i.url),
    videos: items.filter((i) => i.type === "video").map((i) => i.url),
  };
}

/** Columns both tables share, mapped from a V2 row. */
function sharedFields(r: V2Row, countryId: number | null) {
  return {
    description: r.description ?? null,
    logo_url: r.logo_url ?? null,
    cover_url: r.cover_url ?? null,
    website: r.website ?? null,
    phone: r.phone ?? null,
    country_id: countryId,
    state: r.state ?? null,
    city: r.city ?? null,
    address: r.address ?? null,
    postcode: r.postcode ?? null,
    linkedin_url: r.linkedin_url ?? null,
    facebook_url: r.facebook_url ?? null,
    instagram_url: r.instagram_url ?? null,
    twitter_url: r.twitter_url ?? null,
    youtube_url: r.youtube_url ?? null,
    verified_at: r.verified_at ?? null,
    is_published: r.is_published === "true",
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** Everything V2 tracked that has no v3 column — preserved rather than dropped. */
function metaFrom(r: V2Row) {
  const keep = [
    "default_currency",
    "total_services",
    "total_students",
    "total_agents",
    "profile_views",
    "created_via",
    "source_reference",
  ] as const;
  return {
    created_via: "v2_import",
    v2_id: r.id,
    v2_business_category_id: r.business_category_id ?? null,
    ...Object.fromEntries(keep.filter((k) => r[k]).map((k) => [k, r[k]])),
  };
}

export async function seed(knex: Knex): Promise<void> {
  const rows = v2Rows as V2Row[];

  const countries: Array<{ id: number; name: string }> = await knex("countries").select("id", "name");
  const countryId = (name?: string) => countries.find((c) => c.name === name)?.id ?? null;

  const agencyCategory = await knex("business_categories").where({ slug: "education_agency" }).first();

  for (const r of rows) {
    const subdomain = r.slug!;
    const gallery = splitGallery(r.gallery_urls);

    if (r.business_type === "institution") {
      if (await knex("institutions").where({ subdomain }).first()) continue;

      // institutions.email is uniquely indexed where NOT NULL (the dump has duplicates) —
      // same rule as promote: the loser keeps its address in meta instead of failing.
      const email = r.email ?? null;
      const emailTaken = email ? !!(await knex("institutions").where({ email }).first()) : false;

      await knex("institutions").insert({
        institution_name: r.name!,
        subdomain,
        email: emailTaken ? null : email,
        ...sharedFields(r, countryId(r.country)),
        gallery_images: gallery.images.length ? gallery.images : null,
        video_urls: gallery.videos.length ? gallery.videos : null,
        status: r.status === "verified" ? "verified" : "pending",
        claim_status: "unclaimed",
        meta: JSON.stringify({ ...metaFrom(r), ...(emailTaken ? { contact_email: email } : {}) }),
        // platform_user_id / first_name / last_name stay NULL, account_status stays 0,
        // schema_provisioned_at stays NULL — provisioned on claim accept.
      });
    } else {
      if (await knex("businesses").where({ subdomain }).first()) continue;

      await knex("businesses").insert({
        business_name: r.name!,
        business_type: r.business_type,
        business_category_id: r.business_type === "agent" ? (agencyCategory?.id ?? null) : null,
        subdomain,
        email: r.email ?? null,
        ...sharedFields(r, countryId(r.country)),
        gallery_images: gallery.images.length ? gallery.images : null,
        video_urls: gallery.videos.length ? gallery.videos : null,
        status: r.status === "verified" ? "verified" : "unverified",
        claim_status: "unclaimed",
        enquiry_enabled: r.enquiry_enabled !== "false",
        enquiry_coin_cost: Number(r.enquiry_coin_cost ?? 30),
        enquiry_max_distributions: Number(r.enquiry_max_distributions ?? 5),
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
        cover_position: r.cover_position ?? null,
        show_team_public: r.show_team_public !== "false",
        meta: JSON.stringify(metaFrom(r)),
        // owner_id stays NULL (unclaimed), account_status stays 0.
      });
    }
  }
}
