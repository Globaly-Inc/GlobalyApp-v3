// Pure helpers behind the V1 -> V3 importers (plan M0-M2).
// No database: everything here is a value transformation the importers depend on.

import { describe, expect, it } from "vitest";

import {
  ISO3_BY_ISO2,
  NON_OFFICIAL_ISO3,
  classifyLooseDate,
  deriveIso3,
  mapFieldType,
  parseArgs,
  toDateOrNull,
} from "../../database/scripts/migrate-lib.mjs";
import { buildCountryResolver, normalizeCountry } from "../../database/scripts/recon-v2-users.mjs";
import { cityKey, toRegion } from "../../database/scripts/import-v1-geo.mjs";
import { planFix } from "../../database/scripts/backfill-country-fks.mjs";
import { CORE_FIELD_ENTITY_ID, normalizeStatus, toSchemaField } from "../../database/scripts/import-v1-reference.mjs";

describe("deriveIso3", () => {
  // V1 stores only alpha-2, V3 requires a NOT NULL alpha-3.
  it.each([
    ["AU", "AUS"],
    ["HR", "HRV"],
    ["NP", "NPL"],
    ["US", "USA"],
    ["GB", "GBR"],
    ["AE", "ARE"],
  ])("maps %s to %s", (iso2, iso3) => {
    expect(deriveIso3(iso2)?.iso3).toBe(iso3);
  });

  it("is case-insensitive and tolerates padding", () => {
    expect(deriveIso3(" np ")?.iso3).toBe("NPL");
    expect(deriveIso3("nP")?.iso3).toBe("NPL");
  });

  it("returns null for an unknown code rather than inventing one", () => {
    expect(deriveIso3("ZZ")).toBeNull();
    expect(deriveIso3("")).toBeNull();
    expect(deriveIso3(null)).toBeNull();
    expect(deriveIso3(undefined)).toBeNull();
  });

  it("flags user-assigned codes as not official", () => {
    const kosovo = deriveIso3("XK");
    expect(kosovo?.iso3).toBe("XKX");
    expect(kosovo?.official).toBe(false);
    expect(kosovo?.note).toBe(NON_OFFICIAL_ISO3.XKX);
  });

  it("marks a real ISO code as official with no note", () => {
    expect(deriveIso3("AU")).toEqual({ iso3: "AUS", official: true, note: null });
  });
});

describe("ISO3_BY_ISO2 table integrity", () => {
  const entries = Object.entries(ISO3_BY_ISO2 as Record<string, string>);

  it("covers the whole V1 country set and then some", () => {
    // The V1 restore has 198 countries; the table is the full ISO 3166-1 list.
    expect(entries.length).toBeGreaterThanOrEqual(198);
  });

  it("holds only well-formed codes", () => {
    const malformed = entries.filter(([a2, a3]) => !/^[A-Z]{2}$/.test(a2) || !/^[A-Z]{3}$/.test(a3));
    expect(malformed).toEqual([]);
  });

  it("never maps two countries onto the same alpha-3", () => {
    // A collision would violate countries_iso3_unique halfway through a load.
    const seen = new Map<string, string>();
    const duplicates: string[][] = [];
    for (const [a2, a3] of entries) {
      if (seen.has(a3)) duplicates.push([seen.get(a3)!, a2, a3]);
      seen.set(a3, a2);
    }
    expect(duplicates).toEqual([]);
  });
});

describe("buildCountryResolver", () => {
  const resolve = buildCountryResolver([
    { id: 1, name: "Australia", iso2: "AU", iso3: "AUS" },
    { id: 2, name: "Nepal", iso2: "NP", iso3: "NPL" },
    { id: 3, name: "Croatia", iso2: "HR", iso3: "HRV" },
  ]);

  it.each([
    ["Australia", 1],
    ["au", 1],
    ["AUS", 1],
    [" NPL ", 2],
    ["HR", 3], // the code the first recon could not resolve
  ])("resolves %s", (value, id) => {
    expect(resolve(value)).toBe(id);
  });

  it("returns null for a country the table does not contain", () => {
    // This is the failure mode that silently NULLed FKs against a 24-country V3.
    expect(resolve("Zimbabwe")).toBeNull();
    expect(resolve("")).toBeNull();
    expect(resolve(null)).toBeNull();
  });

  it("resolves once the full country set is loaded", () => {
    const full = buildCountryResolver([{ id: 9, name: "Zimbabwe", iso2: "ZW", iso3: "ZWE" }]);
    expect(full("Zimbabwe")).toBe(9);
    expect(full("zw")).toBe(9);
  });
});

describe("normalizeCountry", () => {
  it("lowercases and trims, and treats blank as absent", () => {
    expect(normalizeCountry(" Nepal ")).toBe("nepal");
    expect(normalizeCountry("   ")).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
  });
});

describe("toRegion", () => {
  it("carries V1 continent across as V3 region", () => {
    expect(toRegion(" Oceania ")).toBe("Oceania");
  });

  it("treats blank and non-strings as absent", () => {
    expect(toRegion("")).toBeNull();
    expect(toRegion(null)).toBeNull();
  });
});

describe("cityKey", () => {
  it("is case- and whitespace-insensitive within a country", () => {
    expect(cityKey(1, "Sydney")).toBe(cityKey(1, " sydney "));
  });

  it("keeps same-named cities in different countries apart", () => {
    expect(cityKey(1, "Sydney")).not.toBe(cityKey(2, "Sydney"));
  });
});

describe("planFix (country FK backfill)", () => {
  it("repairs a NULL that the source can now resolve", () => {
    expect(planFix(null, 5, "Zimbabwe")).toEqual({ action: "repaired", to: 5 });
  });

  it("is a no-op on the second run", () => {
    expect(planFix(5, 5, "Zimbabwe").action).toBe("unchanged");
  });

  it("corrects an id that disagrees with the source", () => {
    expect(planFix(4, 5, "Zimbabwe")).toEqual({ action: "corrected", to: 5 });
  });

  it("reports rather than guesses when the source value will not resolve", () => {
    expect(planFix(null, null, "Atlantis").action).toBe("unresolved");
  });

  it("does not treat a missing source value as a repair opportunity", () => {
    expect(planFix(null, null, null).action).toBe("unchanged");
    expect(planFix(null, null, "  ").action).toBe("unchanged");
  });
});

describe("classifyLooseDate", () => {
  it.each([
    ["2026-04-12", "iso-date"],
    ["2024-05", "iso-month"],
    ["01/2008", "mm/yyyy"],
    ["01/24", "mm/yy"],
    ["2024", "yyyy"],
    ["", "empty"],
    [null, "empty"],
    ["sometime in spring", "unparseable"],
  ])("classifies %s as %s", (value, kind) => {
    expect(classifyLooseDate(value)).toBe(kind);
  });

  it("recognises the Date node-pg returns for a date column", () => {
    expect(classifyLooseDate(new Date(2026, 3, 6))).toBe("iso-date");
    expect(classifyLooseDate(new Date("nope"))).toBe("unparseable");
  });
});

describe("toDateOrNull", () => {
  it.each([
    ["2026-04-12", "2026-04-12"],
    ["01/2008", "2008-01-01"],
    ["2024-05", "2024-05-01"],
    ["2024", "2024-01-01"],
  ])("coerces %s to %s", (value, expected) => {
    expect(toDateOrNull(value)).toBe(expected);
  });

  it("uses the local calendar day of a Date, not the UTC one", () => {
    expect(toDateOrNull(new Date(2026, 3, 6))).toBe("2026-04-06");
  });

  it("refuses to guess an ambiguous two-digit year", () => {
    expect(toDateOrNull("01/24")).toBeNull();
  });

  it("returns null for junk so the caller can report it", () => {
    expect(toDateOrNull("garbage")).toBeNull();
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull("")).toBeNull();
  });
});

describe("mapFieldType", () => {
  it("renames the one type V3 spells differently", () => {
    expect(mapFieldType("multi-select")).toBe("multi_select");
  });

  it("passes every other V1 type through unchanged", () => {
    for (const t of ["text", "select", "date", "email", "url", "phone", "image", "images", "videos", "location", "db_country"]) {
      expect(mapFieldType(t)).toBe(t);
    }
  });
});

describe("toSchemaField", () => {
  const field = toSchemaField({
    field_key: "study_level",
    label: "Study Level",
    field_type: "multi-select",
    is_required: true,
    is_filterable: false,
    entity_type: "business",
    options: ["a", "b"],
  });

  it("renames V1 columns onto the V3 schema_fields shape", () => {
    expect(field.key).toBe("study_level");
    expect(field.type).toBe("multi_select");
    expect(field.filterable).toBe(false);
    expect(field.is_required).toBe(true);
  });

  it("synthesises the polymorphic owner V3 requires", () => {
    expect(field.entity_id).toBe(CORE_FIELD_ENTITY_ID);
    expect(field.entity_type).toBe("business");
    expect(field.is_default).toBe(true);
  });

  it("serialises options for the jsonb column and keeps absence as NULL", () => {
    expect(field.options).toBe('["a","b"]');
    expect(toSchemaField({ field_key: "k", label: "L", field_type: "text", entity_type: "user" }).options).toBeNull();
  });
});

describe("normalizeStatus", () => {
  it("accepts the values the V3 CHECK constraint allows", () => {
    expect(normalizeStatus("approved")).toBe("approved");
    expect(normalizeStatus(" Pending ")).toBe("pending");
    expect(normalizeStatus("rejected")).toBe("rejected");
  });

  it("returns null for anything that would violate the constraint", () => {
    expect(normalizeStatus("archived")).toBeNull();
    expect(normalizeStatus(null)).toBeNull();
  });
});

describe("parseArgs", () => {
  it("defaults to a dry run", () => {
    expect(parseArgs([])).toEqual({ apply: false, selfCheck: false, json: false });
  });

  it("reads the flags every importer shares", () => {
    expect(parseArgs(["--apply", "--json"])).toEqual({ apply: true, selfCheck: false, json: true });
    expect(parseArgs(["--self-check"]).selfCheck).toBe(true);
  });
});
