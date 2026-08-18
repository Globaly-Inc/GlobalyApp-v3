// filter_config is DATA, never SQL.
//
// V2 typed it `z.any()` (user-prefs.ts) and stored whatever arrived. A saved filter
// is a query SHAPE, so the temptation is to turn it into a WHERE clause — which
// would make every key and value an injection site. V3 never does: the config is
// stored, returned, and applied by the caller against its own typed query params.
// This suite pins the two halves of that contract:
//
//   1. The shape is BOUNDED (key count, key length, value length, nesting depth),
//      so one POST cannot park megabytes of jsonb per row.
//   2. SQL-looking text is ordinary data — accepted, stored verbatim, never a
//      special case. A schema that rejected quotes would be pretending to be a
//      sanitiser, which is the wrong defence and hides the real one.

import { describe, expect, it } from "vitest";

import {
  FILTER_CONFIG_LIMITS,
  SaveFilterSchema,
  FilterConfigSchema,
} from "../../src/modules/favorites/schemas/saved-filters.schema.js";

const valid = { status: "open", country_id: [1, 2, 3], unassigned: true, q: null };

describe("FilterConfigSchema", () => {
  it("accepts scalars, nulls and arrays of scalars", () => {
    expect(FilterConfigSchema.parse(valid)).toEqual(valid);
  });

  it("accepts an empty config", () => {
    expect(FilterConfigSchema.parse({})).toEqual({});
  });

  it("treats SQL as data, not as an attack to sanitise", () => {
    const sqlish = {
      "q": "'; DROP TABLE saved_filters; --",
      "status": ["open' OR 1=1 --", "closed"],
      'weird"key': "x",
    };
    // Stored and returned verbatim. Nothing here is ever interpolated, so quotes
    // are just characters.
    expect(FilterConfigSchema.parse(sqlish)).toEqual(sqlish);
  });

  it("rejects a non-object", () => {
    for (const bad of [null, "x", 1, true, [1, 2]]) {
      expect(() => FilterConfigSchema.parse(bad), `accepted ${JSON.stringify(bad)}`).toThrow();
    }
  });

  it("rejects nested objects — a filter is one level of key to value", () => {
    expect(() => FilterConfigSchema.parse({ a: { b: 1 } })).toThrow();
    expect(() => FilterConfigSchema.parse({ a: [{ b: 1 }] })).toThrow();
    expect(() => FilterConfigSchema.parse({ a: [[1]] })).toThrow();
  });

  it("bounds the number of keys", () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: FILTER_CONFIG_LIMITS.maxKeys + 1 }, (_, i) => [`k${i}`, 1]),
    );
    expect(() => FilterConfigSchema.parse(tooMany)).toThrow();

    const atLimit = Object.fromEntries(
      Array.from({ length: FILTER_CONFIG_LIMITS.maxKeys }, (_, i) => [`k${i}`, 1]),
    );
    expect(FilterConfigSchema.parse(atLimit)).toEqual(atLimit);
  });

  it("bounds key length", () => {
    const long = "k".repeat(FILTER_CONFIG_LIMITS.maxKeyLength + 1);
    expect(() => FilterConfigSchema.parse({ [long]: 1 })).toThrow();
  });

  it("bounds string value length", () => {
    const long = "v".repeat(FILTER_CONFIG_LIMITS.maxValueLength + 1);
    expect(() => FilterConfigSchema.parse({ q: long })).toThrow();
  });

  it("bounds array length", () => {
    const long = Array.from({ length: FILTER_CONFIG_LIMITS.maxArrayLength + 1 }, (_, i) => i);
    expect(() => FilterConfigSchema.parse({ ids: long })).toThrow();
  });
});

describe("SaveFilterSchema", () => {
  const base = { module_key: "enquiries", name: "Open in AU", filter_config: valid };

  it("accepts a minimal filter", () => {
    const parsed = SaveFilterSchema.parse(base);
    expect(parsed.shared).toBe(false);
    expect(parsed.description).toBeNull();
  });

  it("defaults filter_config to an empty object", () => {
    expect(SaveFilterSchema.parse({ module_key: "enquiries", name: "All" }).filter_config).toEqual({});
  });

  it("rejects a client-supplied owner, use_count or business scope", () => {
    // created_by comes from the JWT and use_count is bumped server-side only.
    for (const extra of [{ created_by: 1 }, { use_count: 999 }, { business_id: 7 }, { id: 3 }]) {
      expect(() => SaveFilterSchema.parse({ ...base, ...extra }), JSON.stringify(extra)).toThrow();
    }
  });

  it("requires a non-blank module_key and name", () => {
    expect(() => SaveFilterSchema.parse({ ...base, module_key: "  " })).toThrow();
    expect(() => SaveFilterSchema.parse({ ...base, name: "" })).toThrow();
  });
});
