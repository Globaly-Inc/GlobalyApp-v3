import { describe, expect, it } from "vitest";
import {
  PaginationSchema,
  buildPaginatedResponse,
  paginationToOffset,
} from "../../src/shared/pagination.js";

describe("PaginationSchema", () => {
  it("defaults to page 1, limit 20 when nothing is supplied", () => {
    expect(PaginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it("coerces numeric strings from the query string", () => {
    expect(PaginationSchema.parse({ page: "3", limit: "50" })).toEqual({ page: 3, limit: 50 });
  });

  describe("clamping bounds", () => {
    it("accepts the lowest legal page and limit", () => {
      expect(PaginationSchema.parse({ page: 1, limit: 1 })).toEqual({ page: 1, limit: 1 });
    });

    it("accepts the highest legal limit", () => {
      expect(PaginationSchema.parse({ page: 1, limit: 100 })).toEqual({ page: 1, limit: 100 });
    });

    it("rejects page 0 (one below the floor)", () => {
      expect(() => PaginationSchema.parse({ page: 0 })).toThrow();
    });

    it("rejects limit 0 (one below the floor)", () => {
      expect(() => PaginationSchema.parse({ limit: 0 })).toThrow();
    });

    it("rejects limit 101 (one above the ceiling)", () => {
      expect(() => PaginationSchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe("invalid input", () => {
    it.each([
      ["negative page", { page: -1 }],
      ["fractional page", { page: 1.5 }],
      ["fractional limit", { limit: 10.5 }],
      ["non-numeric page", { page: "abc" }],
      ["null page", { page: null }],
    ])("rejects %s", (_label, input) => {
      expect(() => PaginationSchema.parse(input)).toThrow();
    });
  });
});

describe("paginationToOffset", () => {
  it("puts page 1 at offset 0", () => {
    expect(paginationToOffset({ page: 1, limit: 20 })).toEqual({ limit: 20, offset: 0 });
  });

  it("advances by exactly one page width per page (no off-by-one)", () => {
    expect(paginationToOffset({ page: 2, limit: 20 }).offset).toBe(20);
    expect(paginationToOffset({ page: 3, limit: 20 }).offset).toBe(40);
    expect(paginationToOffset({ page: 7, limit: 15 }).offset).toBe(90);
  });

  it("never produces a negative offset for the first page of any limit", () => {
    expect(paginationToOffset({ page: 1, limit: 1 }).offset).toBe(0);
    expect(paginationToOffset({ page: 1, limit: 100 }).offset).toBe(0);
  });
});

describe("buildPaginatedResponse", () => {
  it("echoes the page/limit it was given alongside the data", () => {
    const res = buildPaginatedResponse(["a", "b"], 2, { page: 1, limit: 20 });
    expect(res.data).toEqual(["a", "b"]);
    expect(res.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it.each([
    [0, 20, 0],
    [1, 20, 1],
    [19, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [40, 20, 2],
    [41, 20, 3],
  ])("totalPages for total=%i limit=%i is %i", (total, limit, expected) => {
    expect(buildPaginatedResponse([], total, { page: 1, limit }).meta.totalPages).toBe(expected);
  });

  it("reports a page past the end without inventing extra pages", () => {
    const res = buildPaginatedResponse([], 5, { page: 99, limit: 20 });
    expect(res.data).toEqual([]);
    expect(res.meta.page).toBe(99);
    expect(res.meta.totalPages).toBe(1);
  });
});
