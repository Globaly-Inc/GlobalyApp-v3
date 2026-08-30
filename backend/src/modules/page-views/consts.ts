/**
 * Pages that carry a view counter. Mirrors the page_views_type_chk DB constraint.
 *
 * "business" covers education agents and every other business profile — they share one page,
 * /business/[subdomain]. Institutions and scraped visa-service providers have their own pages,
 * so they count separately.
 */
export const PAGE_VIEW_TYPES = ["business", "service", "course", "institution", "visa-service"] as const;

export type PageViewType = (typeof PAGE_VIEW_TYPES)[number];

/** What the first visitor sees. Kept in step with the column default in the migration. */
export const STARTING_VIEWS = 500;
