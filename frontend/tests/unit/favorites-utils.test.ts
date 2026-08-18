import { describe, expect, it } from "vitest";

import type { Favourite, FavouriteItemType } from "@/app/personal/favorites/apis";
import { FAVOURITE_ITEM_TYPES } from "@/app/personal/favorites/apis";
import { FAVOURITE_TYPE_CONFIG } from "@/app/personal/favorites/const";
import {
  favouriteHref,
  favouriteTitle,
  isUnavailable,
  savedOn,
  tabCounts,
  totalCount,
} from "@/app/personal/favorites/utils";

function favourite(over: Partial<Favourite> = {}): Favourite {
  return {
    id: 1,
    item_type: "scholarship",
    item_id: "42",
    created_at: "2026-08-01T10:00:00.000Z",
    target: { title: "Chevening Scholarship", slug: "chevening" },
    ...over,
  };
}

describe("the null target (V1's raw-uuid bug)", () => {
  it("labels a removed target instead of rendering its raw id", () => {
    const gone = favourite({ item_type: "service", item_id: "3f1c9d2e-0000-4000-8000-000000000abc", target: null });
    expect(favouriteTitle(gone)).toBe("No longer available");
    // The exact defect: V1 put fav.item_id in the title slot, so a saved course
    // showed a bare uuid. The id must not reach the title under any spelling.
    expect(favouriteTitle(gone)).not.toContain(gone.item_id);
    expect(isUnavailable(gone)).toBe(true);
  });

  it("never links a removed target, even for a type that has a route", () => {
    // service HAS a public route; the missing target is what removes the link.
    expect(FAVOURITE_TYPE_CONFIG.service.route).not.toBeNull();
    expect(favouriteHref(favourite({ item_type: "service", target: null }))).toBeNull();
  });

  it("still uses the resolved title when the target is present", () => {
    expect(favouriteTitle(favourite())).toBe("Chevening Scholarship");
    expect(isUnavailable(favourite())).toBe(false);
  });

  it("treats a target with a null slug as present but unlinkable", () => {
    const noSlug = favourite({ item_type: "institution", target: { title: "Monash", slug: null } });
    expect(favouriteTitle(noSlug)).toBe("Monash");
    expect(isUnavailable(noSlug)).toBe(false);
    expect(favouriteHref(noSlug)).toBeNull();
  });
});

describe("favouriteHref", () => {
  it("builds a slug route for a slug-keyed type", () => {
    expect(favouriteHref(favourite({ item_type: "scholarship" }))).toBe("/scholarships/chevening");
    expect(favouriteHref(favourite({ item_type: "service", target: { title: "MBA", slug: "mba-2027" } }))).toBe(
      "/course/mba-2027",
    );
  });

  it("uses the saved item_id for other_service, which has no public slug", () => {
    const row = favourite({ item_type: "other_service", item_id: "77", target: { title: "Airport pickup", slug: null } });
    expect(favouriteHref(row)).toBe("/service/77");
  });

  it("returns null for a type with no public detail route in this build", () => {
    for (const type of ["institution", "business", "job", "event"] as FavouriteItemType[]) {
      expect(FAVOURITE_TYPE_CONFIG[type].route, `${type} route`).toBeNull();
      expect(favouriteHref(favourite({ item_type: type })), `${type} href`).toBeNull();
    }
  });

  it("returns null when the route wants a slug and the resolved target has none", () => {
    // The route exists and the target exists — only the slug is missing, which
    // catalog_services.slug is nullable enough to allow.
    const row = favourite({ item_type: "service", target: { title: "Untitled course", slug: null } });
    expect(FAVOURITE_TYPE_CONFIG.service.by).toBe("slug");
    expect(favouriteHref(row)).toBeNull();
    // Still a real, linkless row rather than a "removed" one.
    expect(favouriteTitle(row)).toBe("Untitled course");
    expect(isUnavailable(row)).toBe(false);
  });

  it("encodes the identifier so an odd slug cannot break out of the path", () => {
    const row = favourite({ item_type: "scholarship", target: { title: "Odd", slug: "a/b?c" } });
    expect(favouriteHref(row)).toBe("/scholarships/a%2Fb%3Fc");
  });
});

describe("tab counts", () => {
  it("densifies the backend's sparse counts so every tab has a number", () => {
    const dense = tabCounts({ scholarship: 3, job: 1 });
    expect(dense.scholarship).toBe(3);
    expect(dense.job).toBe(1);
    // Absent, not zero, in the payload — a tab badge must still render 0.
    expect(dense.service).toBe(0);
    expect(Object.keys(dense).sort()).toEqual([...FAVOURITE_ITEM_TYPES].sort());
  });

  it("covers every type when the user has saved nothing", () => {
    const dense = tabCounts({});
    expect(Object.values(dense)).toEqual(FAVOURITE_ITEM_TYPES.map(() => 0));
  });

  it("sums every type for the All badge, ignoring the current filter", () => {
    // The regression this guards: reading meta.total instead, which reports the
    // CURRENT query's total and reads as the filtered number while a tab is open.
    expect(totalCount({ scholarship: 3, job: 1, service: 2 })).toBe(6);
    expect(totalCount({})).toBe(0);
  });

  it("ignores a key that is not part of the closed vocabulary", () => {
    // A drifted payload must not inflate the All badge with a type this build
    // cannot render a tab for.
    expect(totalCount({ scholarship: 2, course: 9 } as never)).toBe(2);
  });
});

describe("savedOn", () => {
  it("returns an empty string rather than 'Invalid Date'", () => {
    expect(savedOn("not-a-date")).toBe("");
    expect(savedOn("")).toBe("");
  });

  it("formats a real timestamp", () => {
    expect(savedOn("2026-08-01T10:00:00.000Z")).not.toBe("");
  });
});
