// Public org profiles and the sitemap inventory (Wave C2b).
//
// The services block is not its own query: it delegates to the catalog service
// with the org pinned, so a profile can only ever show what /catalog/services
// would show for that org — same liveScope(), same shape, one code path to keep
// honest. It also means every filter the catalog understands works on a profile
// for free (a college page can show "only bachelor's, only February intakes").

import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/profiles.repository.js";
import type { OrgKind, OrgRow } from "../repositories/profiles.repository.js";
import type { ListServicesQuery } from "../schemas/catalog.schema.js";
import type { SitemapQuery } from "../schemas/profiles.schema.js";
import { PUBLIC_PATHS, baseUrl, orgSeo } from "../utils/seo.js";
import { listServices } from "./catalog.service.js";

/** Crawl hints per section, mirroring the priorities V1's sitemap script emitted. */
const SITEMAP_HINTS: Record<SitemapQuery["type"], { changefreq: string; priority: number }> = {
  country: { changefreq: "monthly", priority: 0.7 },
  city: { changefreq: "monthly", priority: 0.6 },
  institution: { changefreq: "weekly", priority: 0.6 },
  service: { changefreq: "weekly", priority: 0.6 },
  agent: { changefreq: "monthly", priority: 0.5 },
};

function toProfile(row: OrgRow, kind: OrgKind) {
  const {
    category_id,
    category_name,
    category_slug,
    country_id,
    country_name,
    country_iso2,
    country_slug,
    linkedin_url,
    facebook_url,
    instagram_url,
    twitter_url,
    youtube_url,
    whatsapp_url,
    ...org
  } = row;

  return {
    ...org,
    kind,
    category: category_id ? { id: category_id, name: category_name, slug: category_slug } : null,
    country: country_id
      ? { id: country_id, name: country_name, iso2: country_iso2, slug: country_slug }
      : null,
    social: {
      linkedin: linkedin_url ?? null,
      facebook: facebook_url ?? null,
      instagram: instagram_url ?? null,
      twitter: twitter_url ?? null,
      youtube: youtube_url ?? null,
      whatsapp: whatsapp_url ?? null,
    },
    seo: orgSeo({
      kind,
      slug: row.slug,
      name: row.name,
      description: row.description as string | null,
      logo_url: row.logo_url as string | null,
      cover_url: row.cover_url as string | null,
      address: row.address as string | null,
      city: row.city as string | null,
      state: row.state as string | null,
      postcode: row.postcode as string | null,
      country_name: country_name as string | null,
      website: row.website as string | null,
    }),
  };
}

/**
 * `kind` comes from the route, not the request: /catalog/institutions/:slug must
 * 404 an agent rather than serve it under the wrong canonical URL, which would
 * put the same org on two indexable paths.
 */
export async function getProfile(kind: OrgKind, slug: string, query: ListServicesQuery) {
  const row = await repo.findOrgBySlug(slug);
  if (!row || repo.kindForCategory(row.category_slug) !== kind) {
    throw new NotFoundError(kind === "institution" ? "Institution not found" : "Agent not found");
  }

  const services = await listServices({ ...query, org_type: row.org_type, org_id: row.id });

  return {
    data: {
      ...toProfile(row, kind),
      services: services.data,
      services_total: services.meta.total,
      services_meta: services.meta,
    },
  };
}

interface SitemapEntry {
  path: string;
  type: SitemapQuery["type"];
  lastmod: string | null;
  changefreq: string;
  priority: number;
}

interface SitemapPath {
  path: string;
  lastmod: Date | string | null;
}

async function fetchSection(
  type: SitemapQuery["type"],
  limit: number,
  offset: number,
): Promise<{ total: number; paths: SitemapPath[] }> {
  switch (type) {
    case "institution":
    case "agent": {
      const kind = type;
      const { rows, total } = await repo.listOrgSlugs([kind], limit, offset);
      return { total, paths: rows.map((r) => ({ path: PUBLIC_PATHS[kind](r.slug), lastmod: r.lastmod })) };
    }
    case "service": {
      const { rows, total } = await repo.listServiceSitemapRows(limit, offset);
      return {
        total,
        paths: rows.map((r: { service_id: string; name: string; lastmod: Date | null }) => ({
          path: PUBLIC_PATHS.service(r.name, r.service_id),
          lastmod: r.lastmod,
        })),
      };
    }
    case "country": {
      const { rows, total } = await repo.listCountrySitemapRows(limit, offset);
      return { total, paths: rows.map((r) => ({ path: PUBLIC_PATHS.country(r.slug), lastmod: r.lastmod })) };
    }
    case "city": {
      const { rows, total } = await repo.listCitySitemapRows(limit, offset);
      return {
        total,
        paths: rows.map((r: { slug: string; country_slug: string; lastmod: Date | null }) => ({
          path: PUBLIC_PATHS.city(r.country_slug, r.slug),
          lastmod: r.lastmod,
        })),
      };
    }
  }
}

/**
 * One section of the sitemap at a time. The frontend's sitemap.ts renders the XML
 * — this is the inventory it renders from, so it stays JSON and stays paged: at
 * 147 tenants the service section alone outgrows a single response long before it
 * outgrows the 50,000-URL file limit.
 */
export async function getSitemap(query: SitemapQuery) {
  const { limit, offset } = paginationToOffset(query);
  const { paths, total } = await fetchSection(query.type, limit, offset);
  const hint = SITEMAP_HINTS[query.type];

  const entries: SitemapEntry[] = paths.map((p) => ({
    path: p.path,
    type: query.type,
    lastmod: p.lastmod ? new Date(p.lastmod).toISOString() : null,
    ...hint,
  }));

  return { ...buildPaginatedResponse(entries, total, query), base_url: baseUrl() };
}
