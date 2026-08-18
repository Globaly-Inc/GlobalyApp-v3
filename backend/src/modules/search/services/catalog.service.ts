// Public catalog service — shapes projection rows into the response the public
// site consumes. No auth, no tenant context: the only access rule is the live
// scope enforced in the repository.

import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/catalog.repository.js";
import type { ListServicesQuery } from "../schemas/catalog.schema.js";
import { serviceSeo } from "../utils/seo.js";

interface Row extends Record<string, unknown> {
  service_id: string;
  owner_org_type: string;
  owner_org_id: number;
}

function toService(row: Row) {
  const {
    owner_org_type,
    owner_org_id,
    owner_slug,
    owner_name,
    owner_city,
    owner_logo_url,
    owner_website,
    owner_claim_status,
    country_id,
    country_name,
    country_iso2,
    category_id,
    category_name,
    category_slug,
    degree_level_id,
    degree_level_name,
    degree_level_slug,
    area_of_study_id,
    area_of_study_name,
    area_of_study_slug,
    schema_name: _schema, // never leaked: it is the tenant's non-guessable schema id
    ...service
  } = row;

  return {
    ...service,
    category: category_id ? { id: category_id, name: category_name, slug: category_slug } : null,
    degree_level: degree_level_id ? { id: degree_level_id, name: degree_level_name, slug: degree_level_slug } : null,
    area_of_study: area_of_study_id
      ? { id: area_of_study_id, name: area_of_study_name, slug: area_of_study_slug }
      : null,
    provider: {
      org_type: owner_org_type,
      org_id: owner_org_id,
      // The org's public profile slug — what a service card links to.
      slug: owner_slug ?? null,
      name: owner_name,
      city: owner_city,
      logo_url: owner_logo_url,
      website: owner_website,
      // Present only for institutions — tells the UI whether anybody owns this listing.
      claim_status: owner_claim_status ?? null,
      country: country_id ? { id: country_id, name: country_name, iso2: country_iso2 } : null,
    },
  };
}

export async function listServices(input: ListServicesQuery) {
  const { limit, offset } = paginationToOffset(input);
  const { rows, total } = await repo.listServices(input, limit, offset);
  return buildPaginatedResponse(rows.map((row: Row) => toService(row)), total, input);
}

export async function getService(serviceId: string) {
  const row = (await repo.findService(serviceId)) as Row | undefined;
  if (!row) throw new NotFoundError("Service not found");

  const children = await repo.findServiceChildren(row.schema_name as string, serviceId);
  return {
    data: {
      ...toService(row),
      ...children,
      // Wave C2b: the detail page's canonical URL, title and JSON-LD live with
      // the record, not with whichever page renders it (see utils/seo.ts).
      seo: serviceSeo({
        service_id: serviceId,
        name: row.name as string,
        description: row.description as string | null,
        overview: row.overview as string | null,
        image_url: row.image_url as string | null,
        provider_name: row.owner_name as string | null,
      }),
    },
  };
}

export async function getFacets() {
  return { data: await repo.listFacets() };
}
