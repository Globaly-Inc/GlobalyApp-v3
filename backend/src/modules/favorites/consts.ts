// The favourites vocabulary — the ONLY place a new favouritable type is declared.
//
// `student_favorites.item_type` is unconstrained text in the database
// (20260817_820), following notifications.type, so adding a type costs no
// migration. The price of that is that this file and the zod schema built from it
// are the entire guard. Adding a type = one entry in FAVOURITE_TARGETS. Nothing
// else in the module enumerates types.
//
// V1 → V3 RENAMES. V1's StudentFavorites.tsx stored item_type in
// {course, institution, agent, scholarship}. V3 renames two of them:
//   course → service   (V3 calls a course a service; they live in tenant schemas)
//   agent  → business  (V3 split V1's single `businesses` table into `businesses`,
//                       which are owner-backed and have a tenant schema, and
//                       `institutions`, which are unclaimed directory listings)
// The old spellings are NOT accepted — two spellings for one saved item would
// defeat unique(platform_user_id, item_type, item_id). A V1 loader must translate.

/**
 * How to resolve one item_type back to a displayable target.
 *
 * `table` is always a MASTER table. That is what makes a favourite of a
 * tenant-owned service possible without a cross-tenant FK: `catalog_services` is
 * the master projection of every tenant service (20260817_003), keyed on the
 * service uuid, so master can resolve it on its own.
 *
 * Every one of these tables carries `deleted_at`, verified against the live schema,
 * and the resolver filters on it — a removed target resolves to null rather than
 * leaking a row the user can no longer reach.
 */
export interface FavouriteTarget {
  table: string;
  idColumn: string;
  titleColumn: string;
  /** null where the table has no public slug (other_service_listings). */
  slugColumn: string | null;
  /** Serial int PK (master) or uuid PK (a tenant service). Validated at the route. */
  idShape: "int" | "uuid";
}

export const FAVOURITE_TARGETS = {
  // V1 "course". The tenant `business_services` row, via its master projection.
  service: {
    table: "catalog_services",
    idColumn: "service_id",
    titleColumn: "name",
    slugColumn: "slug",
    idShape: "uuid",
  },
  institution: {
    table: "institutions",
    idColumn: "id",
    titleColumn: "institution_name",
    slugColumn: "slug",
    idShape: "int",
  },
  // V1 "agent".
  business: {
    table: "businesses",
    idColumn: "id",
    titleColumn: "business_name",
    slugColumn: "slug",
    idShape: "int",
  },
  scholarship: {
    table: "scholarships",
    idColumn: "id",
    titleColumn: "title",
    slugColumn: "slug",
    idShape: "int",
  },
  job: {
    table: "student_jobs",
    idColumn: "id",
    titleColumn: "title",
    slugColumn: "slug",
    idShape: "int",
  },
  event: {
    table: "events",
    idColumn: "id",
    titleColumn: "title",
    slugColumn: "slug",
    idShape: "int",
  },
  other_service: {
    table: "other_service_listings",
    idColumn: "id",
    titleColumn: "title",
    slugColumn: null,
    idShape: "int",
  },
} as const satisfies Record<string, FavouriteTarget>;

export type FavouriteItemType = keyof typeof FAVOURITE_TARGETS;

export const FAVOURITE_ITEM_TYPES = Object.keys(FAVOURITE_TARGETS) as [
  FavouriteItemType,
  ...FavouriteItemType[],
];

export function isFavouriteItemType(value: string): value is FavouriteItemType {
  return Object.prototype.hasOwnProperty.call(FAVOURITE_TARGETS, value);
}
