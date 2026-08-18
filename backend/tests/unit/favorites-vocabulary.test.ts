// The favourites vocabulary and the per-type item_id shape check.
//
// `student_favorites.item_type` is deliberately unconstrained text in the database
// (20260817_820) so a new favouritable type costs no migration. That makes THIS the
// only boundary that stops junk reaching storage, so it is tested as pure functions
// with no database in the way.
//
// Spec: V1 StudentFavorites.tsx saves item_type in
// {course, institution, agent, scholarship}; V2 `favorites` stores (item_type,
// item_id) with item_id a uuid. V3 renames course→service and agent→business
// (V3 split V1's businesses into businesses + institutions) and item_id is text
// because master PKs are serial ints while tenant service PKs are uuids.

import { describe, expect, it } from "vitest";

import {
  FAVOURITE_ITEM_TYPES,
  FAVOURITE_TARGETS,
  isFavouriteItemType,
} from "../../src/modules/favorites/consts.js";
import { AddFavoriteSchema } from "../../src/modules/favorites/schemas/favorites.schema.js";

const UUID = "3f1c9d2a-7b45-4e18-9c6d-2a5b8e0f4d31";

describe("favourite item types", () => {
  it("covers every V1 StudentFavorites tab, under V3 names", () => {
    // V1 course → V3 service (a tenant business_services row); V1 agent → V3
    // business. institution and scholarship keep their names.
    expect(FAVOURITE_ITEM_TYPES).toContain("service");
    expect(FAVOURITE_ITEM_TYPES).toContain("institution");
    expect(FAVOURITE_ITEM_TYPES).toContain("business");
    expect(FAVOURITE_ITEM_TYPES).toContain("scholarship");
  });

  it("does not accept V1's pre-rename spellings", () => {
    // Accepting both would let two rows mean the same saved item and defeat the
    // unique(platform_user_id, item_type, item_id) constraint.
    expect(isFavouriteItemType("course")).toBe(false);
    expect(isFavouriteItemType("agent")).toBe(false);
  });

  it("rejects anything outside the vocabulary", () => {
    for (const bad of ["", "Service", "platform_users", "service; drop table x", "__proto__"]) {
      expect(isFavouriteItemType(bad)).toBe(false);
    }
  });

  it("describes a resolvable target for every type, with no gaps", () => {
    // A type in the vocabulary with no descriptor would list as a favourite that
    // can never render — the V1 page's actual bug, one layer down.
    for (const type of FAVOURITE_ITEM_TYPES) {
      const target = FAVOURITE_TARGETS[type];
      expect(target, `no descriptor for ${type}`).toBeDefined();
      expect(target.table).toMatch(/^[a-z_]+$/);
      expect(target.idColumn).toMatch(/^[a-z_]+$/);
      expect(target.titleColumn).toMatch(/^[a-z_]+$/);
      expect(["int", "uuid"]).toContain(target.idShape);
    }
  });
});

describe("AddFavoriteSchema — per-type item_id shape", () => {
  it("accepts a uuid for a tenant-owned service", () => {
    const parsed = AddFavoriteSchema.parse({ item_type: "service", item_id: UUID });
    expect(parsed.item_id).toBe(UUID);
  });

  it("rejects an integer id for a service, whose PK is a uuid", () => {
    expect(() => AddFavoriteSchema.parse({ item_type: "service", item_id: "42" })).toThrow();
  });

  it("accepts a positive integer id for a master-schema target", () => {
    expect(AddFavoriteSchema.parse({ item_type: "scholarship", item_id: "42" }).item_id).toBe("42");
  });

  it("rejects a uuid where a serial int PK is expected", () => {
    expect(() => AddFavoriteSchema.parse({ item_type: "scholarship", item_id: UUID })).toThrow();
  });

  it("rejects non-positive, padded and non-numeric integer ids", () => {
    for (const bad of ["0", "-1", "1.5", "01", " 1", "1e3", "", "abc"]) {
      expect(
        () => AddFavoriteSchema.parse({ item_type: "scholarship", item_id: bad }),
        `accepted ${JSON.stringify(bad)}`,
      ).toThrow();
    }
  });

  it("rejects an unknown item_type", () => {
    expect(() => AddFavoriteSchema.parse({ item_type: "course", item_id: "1" })).toThrow();
  });

  it("rejects unknown keys, so a client cannot smuggle platform_user_id", () => {
    expect(() =>
      AddFavoriteSchema.parse({ item_type: "scholarship", item_id: "1", platform_user_id: 9 }),
    ).toThrow();
  });
});
