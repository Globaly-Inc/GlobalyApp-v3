/**
 * Pages that carry a view counter — the only definition of the list.
 *
 * Deliberately not a DB constraint: counted pages get added as pages get built, and making that a
 * migration each time bought nothing (20260830_001 wrote the check, 20260830_002 widened it,
 * 20260830_003 dropped it). The zod enum in the route is built from this array, so a type the app
 * does not know never reaches a query.
 *
 * Adding one is three edits and no migration: a slug here, its lookup in `entityExists`
 * (page-views.repository.ts), and the matching union in the frontend's page-views.tsx.
 *
 * "business" covers education counselors and every other business profile — they share one page,
 * /business/[subdomain]. Institutions and scraped visa-service providers have their own pages, so
 * they count separately.
 */
export const PAGE_VIEW_TYPES = ["business", "service", "course", "institution", "visa-service"] as const;

export type PageViewType = (typeof PAGE_VIEW_TYPES)[number];

/**
 * What the first visitor sees. The insert passes this explicitly, so this const is the number —
 * the column default is only a backstop for anything that writes a row without it.
 */
export const STARTING_VIEWS = 500;
