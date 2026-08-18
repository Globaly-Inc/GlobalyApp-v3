// The Stage-2 transforms' pure halves — no database.
//
// Each wave ships a --self-check that asserts the helpers it cannot test any
// other way: the SQL/TypeScript canonicalisers agreeing on accents, the role and
// category maps staying closed, the DNS label refusing to invent a subdomain,
// and the date coercion that a previous attempt got wrong badly enough to NULL
// every row. Running them here means a broken invariant fails in CI rather than
// at the moment someone types --apply.

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { dnsLabel, normalizeCountryKey, normalizeEmail, normKeySql, splitName } from "../../scripts/migration/lib.js";
import { businessesSelfCheck } from "../../scripts/migration/w1-businesses.js";
import { geoSelfCheck } from "../../scripts/migration/w1-geo.js";
import { identitySelfCheck } from "../../scripts/migration/w1-identity.js";
import { tenantsSelfCheck } from "../../scripts/migration/w1-tenants.js";
import { referenceSelfCheck } from "../../scripts/migration/w2-reference.js";
import { dateOnly, subProfilesSelfCheck } from "../../scripts/migration/w3-subprofiles.js";

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SELF_CHECKS = [
  { name: "w1-geo", run: geoSelfCheck },
  { name: "w1-identity", run: identitySelfCheck },
  { name: "w1-businesses", run: businessesSelfCheck },
  { name: "w1-tenants", run: tenantsSelfCheck },
  { name: "w2-reference", run: referenceSelfCheck },
  { name: "w3-subprofiles", run: subProfilesSelfCheck },
] as const;

describe("Stage 2 transform self-checks", () => {
  it.each(SELF_CHECKS)("$name --self-check passes", ({ run }) => {
    expect(() => run()).not.toThrow();
  });

  it("the --self-check CLI flag is wired and exits 0", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", path.join(BACKEND_ROOT, "scripts/migration/w3-subprofiles.ts"), "--self-check"],
      { cwd: BACKEND_ROOT },
    );
    expect(stdout).toContain("w3-subprofiles self-check: ok");
  }, 60_000);
});

describe("dateOnly — the W3 date trap", () => {
  // node-pg parses a `date` column into a JS Date at LOCAL midnight. The two
  // obvious coercions are both wrong, and both wrong in ways that look fine
  // until every row in the table is NULL.
  it("converts a JS Date without shifting it across the date boundary", () => {
    const d = new Date(2020, 7, 12);
    expect(dateOnly(d)).toBe("2020-08-12");
    expect(String(d)).not.toBe("2020-08-12");
  });

  it("zero-pads single-digit months and days", () => {
    expect(dateOnly(new Date(2020, 0, 5))).toBe("2020-01-05");
  });

  it("passes through the text forms a driver may hand back", () => {
    expect(dateOnly("2020-08-12")).toBe("2020-08-12");
    expect(dateOnly("2020-08-12T00:00:00.000Z")).toBe("2020-08-12");
  });

  it("returns null rather than a wrong date for anything unparseable", () => {
    for (const v of [null, undefined, "", "not a date", "12/08/2020"]) {
      expect(dateOnly(v)).toBeNull();
    }
  });
});

describe("the canonicalisers SQL and TypeScript share", () => {
  // Defect D7 plus the accent drift that produced 120 would-be duplicate cities
  // before the SQL side learned to decompose.
  it("collapses the country drift V1 actually contains", () => {
    expect(normalizeCountryKey("INDIA")).toBe(normalizeCountryKey("  india "));
    expect(normalizeCountryKey("VIET NAM")).toBe(normalizeCountryKey("Viet Nam"));
    expect(normalizeCountryKey("Côte d'Ivoire")).toBe("cote d ivoire");
    expect(normalizeCountryKey("   ")).toBeNull();
  });

  it("strips accents on both sides, which is what stops duplicate cities", () => {
    expect(normalizeCountryKey("São Paulo")).toBe(normalizeCountryKey("Sao Paulo"));
    expect(normalizeCountryKey("Nzérékoré")).toBe("nzerekore");
    expect(normKeySql("c.name")).toContain("NFKD");
  });

  it("refuses to invent a subdomain from a name that yields nothing", () => {
    expect(dnsLabel("Asia Pacific International College")).toBe("asia-pacific-international-college");
    expect(dnsLabel("Café Études")).toBe("cafe-etudes");
    expect(dnsLabel("!!!")).toBeNull();
    expect(dnsLabel("x".repeat(80))).toHaveLength(63);
  });

  it("keeps email a usable key or no key at all", () => {
    expect(normalizeEmail(" A@B.com ")).toBe("a@b.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });

  it("splits a V1 name without inventing a surname", () => {
    expect(splitName("Amit Ranjit Kar")).toEqual({ first: "Amit Ranjit", last: "Kar" });
    expect(splitName("Prince")).toEqual({ first: "Prince", last: "" });
  });
});
