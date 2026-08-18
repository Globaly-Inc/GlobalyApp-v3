import {
  Briefcase,
  Building2,
  CalendarDays,
  GraduationCap,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

import { FAVOURITE_ITEM_TYPES, type FavouriteItemType } from "../apis";

export interface FavouriteTypeConfig {
  label: string;
  /** Plural, used in the per-tab empty state. */
  plural: string;
  icon: typeof GraduationCap;
  /**
   * The PUBLIC detail route under app/(web), or null when this build has none.
   *
   * Four of the seven types have no public detail page: there is no
   * /institution/[slug], /business/[slug], /jobs/[id] or /events/[id] in the
   * frontend, so their cards render as plain text. A link to a 404 is worse than
   * no link. When a wave adds one of those routes, filling it in here is the
   * whole change.
   */
  route: string | null;
  /**
   * Which identifier the route takes:
   *   "slug" — the resolved target's slug; falls back to plain text when null
   *   "id"   — the saved item_id (other_service_listings has no public slug)
   */
  by: "slug" | "id";
}

/**
 * Keyed by FavouriteItemType so tsc fails if the backend adds a type to
 * FAVOURITE_TARGETS and this file is not updated with it — a Record over a closed
 * union is a cheaper exhaustiveness guard than a runtime length assertion.
 */
export const FAVOURITE_TYPE_CONFIG: Record<FavouriteItemType, FavouriteTypeConfig> = {
  service: { label: "Course", plural: "courses", icon: GraduationCap, route: "/course", by: "slug" },
  institution: { label: "Institution", plural: "institutions", icon: Building2, route: null, by: "slug" },
  business: { label: "Agent", plural: "agents", icon: Users, route: null, by: "slug" },
  scholarship: { label: "Scholarship", plural: "scholarships", icon: Sparkles, route: "/scholarships", by: "slug" },
  job: { label: "Job", plural: "jobs", icon: Briefcase, route: null, by: "slug" },
  event: { label: "Event", plural: "events", icon: CalendarDays, route: null, by: "slug" },
  other_service: { label: "Service", plural: "services", icon: Wrench, route: "/service", by: "id" },
};

/** Tab order follows the backend's FAVOURITE_TARGETS declaration order. */
export const FAVOURITE_TABS = FAVOURITE_ITEM_TYPES.map((type) => ({
  type,
  ...FAVOURITE_TYPE_CONFIG[type],
}));

/** The extra pseudo-tab that shows everything. Not an item_type. */
export const ALL_TAB = "all" as const;

export type FavouriteTabKey = typeof ALL_TAB | FavouriteItemType;
