// Shared plumbing for the V1 -> V3 import scripts.
//
// Every importer follows the same shape, established by import-v1-users.mjs:
//   dry run by default, --apply to write, one transaction per run (the dry run is
//   the same code path ending in ROLLBACK), natural-key upserts so a second run is
//   a no-op, and unresolved values reported rather than silently dropped.
//
// Pure helpers here are covered by each script's --self-check and by
// tests/unit/migrate-lib.test.ts.

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, "../..");

// ── ISO 3166-1 alpha-2 -> alpha-3 ───────────────────────────────────────────
//
// V3 countries.iso3 is NOT NULL UNIQUE but V1 only stores alpha-2 (`code`), so
// the third code has to come from somewhere. There is no alpha-3 table in the
// stdlib, in Intl, or in any installed dependency, and package.json is off
// limits during this wave — so the standard is transcribed here. Codes are
// official ISO 3166-1 alpha-3 except the ones listed in NON_OFFICIAL_ISO3,
// which the importer reports so nobody mistakes them for the standard.

const ISO3_TABLE =
  "AD:AND AE:ARE AF:AFG AG:ATG AI:AIA AL:ALB AM:ARM AO:AGO AQ:ATA AR:ARG AS:ASM AT:AUT " +
  "AU:AUS AW:ABW AX:ALA AZ:AZE BA:BIH BB:BRB BD:BGD BE:BEL BF:BFA BG:BGR BH:BHR BI:BDI " +
  "BJ:BEN BL:BLM BM:BMU BN:BRN BO:BOL BQ:BES BR:BRA BS:BHS BT:BTN BV:BVT BW:BWA BY:BLR " +
  "BZ:BLZ CA:CAN CC:CCK CD:COD CF:CAF CG:COG CH:CHE CI:CIV CK:COK CL:CHL CM:CMR CN:CHN " +
  "CO:COL CR:CRI CU:CUB CV:CPV CW:CUW CX:CXR CY:CYP CZ:CZE DE:DEU DJ:DJI DK:DNK DM:DMA " +
  "DO:DOM DZ:DZA EC:ECU EE:EST EG:EGY EH:ESH ER:ERI ES:ESP ET:ETH FI:FIN FJ:FJI FK:FLK " +
  "FM:FSM FO:FRO FR:FRA GA:GAB GB:GBR GD:GRD GE:GEO GF:GUF GG:GGY GH:GHA GI:GIB GL:GRL " +
  "GM:GMB GN:GIN GP:GLP GQ:GNQ GR:GRC GS:SGS GT:GTM GU:GUM GW:GNB GY:GUY HK:HKG HM:HMD " +
  "HN:HND HR:HRV HT:HTI HU:HUN ID:IDN IE:IRL IL:ISR IM:IMN IN:IND IO:IOT IQ:IRQ IR:IRN " +
  "IS:ISL IT:ITA JE:JEY JM:JAM JO:JOR JP:JPN KE:KEN KG:KGZ KH:KHM KI:KIR KM:COM KN:KNA " +
  "KP:PRK KR:KOR KW:KWT KY:CYM KZ:KAZ LA:LAO LB:LBN LC:LCA LI:LIE LK:LKA LR:LBR LS:LSO " +
  "LT:LTU LU:LUX LV:LVA LY:LBY MA:MAR MC:MCO MD:MDA ME:MNE MF:MAF MG:MDG MH:MHL MK:MKD " +
  "ML:MLI MM:MMR MN:MNG MO:MAC MP:MNP MQ:MTQ MR:MRT MS:MSR MT:MLT MU:MUS MV:MDV MW:MWI " +
  "MX:MEX MY:MYS MZ:MOZ NA:NAM NC:NCL NE:NER NF:NFK NG:NGA NI:NIC NL:NLD NO:NOR NP:NPL " +
  "NR:NRU NU:NIU NZ:NZL OM:OMN PA:PAN PE:PER PF:PYF PG:PNG PH:PHL PK:PAK PL:POL PM:SPM " +
  "PN:PCN PR:PRI PS:PSE PT:PRT PW:PLW PY:PRY QA:QAT RE:REU RO:ROU RS:SRB RU:RUS RW:RWA " +
  "SA:SAU SB:SLB SC:SYC SD:SDN SE:SWE SG:SGP SH:SHN SI:SVN SJ:SJM SK:SVK SL:SLE SM:SMR " +
  "SN:SEN SO:SOM SR:SUR SS:SSD ST:STP SV:SLV SX:SXM SY:SYR SZ:SWZ TC:TCA TD:TCD TF:ATF " +
  "TG:TGO TH:THA TJ:TJK TK:TKL TL:TLS TM:TKM TN:TUN TO:TON TR:TUR TT:TTO TV:TUV TW:TWN " +
  "TZ:TZA UA:UKR UG:UGA UM:UMI US:USA UY:URY UZ:UZB VA:VAT VC:VCT VE:VEN VG:VGB VI:VIR " +
  "VN:VNM VU:VUT WF:WLF WS:WSM XK:XKX YE:YEM YT:MYT ZA:ZAF ZM:ZMB ZW:ZWE";

export const ISO3_BY_ISO2 = Object.freeze(
  Object.fromEntries(ISO3_TABLE.split(" ").map((pair) => pair.split(":"))),
);

/** Codes that are widely used but are NOT assigned by ISO 3166-1. Always reported. */
export const NON_OFFICIAL_ISO3 = Object.freeze({
  XKX: "Kosovo has no ISO 3166-1 code; XK/XKX are user-assigned (World Bank convention)",
});

/**
 * V1 stores only alpha-2. Returns the alpha-3 plus whether it is official, or
 * null when the code is unknown — the caller reports those rather than inventing
 * a code to satisfy a NOT NULL column.
 */
export function deriveIso3(iso2) {
  if (typeof iso2 !== "string") return null;
  const key = iso2.trim().toUpperCase();
  const iso3 = ISO3_BY_ISO2[key];
  if (!iso3) return null;
  return { iso3, official: !(iso3 in NON_OFFICIAL_ISO3), note: NON_OFFICIAL_ISO3[iso3] ?? null };
}

// ── Small pure helpers ──────────────────────────────────────────────────────

/** CLI flags shared by every importer. */
export function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    selfCheck: argv.includes("--self-check"),
    json: argv.includes("--json"),
  };
}

/**
 * V1 keeps some dates as free text ("01/2008", "01/24", "2026-04-12"). V3's
 * qualification/work-experience columns are text too, so the value is carried
 * across verbatim — but anything that is not a recognisable date is reported so
 * a text column never quietly becomes a junk drawer.
 */
export function classifyLooseDate(value) {
  if (value === null || value === undefined) return "empty";
  // node-pg hands back a real `date` column as a Date at local midnight.
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "unparseable" : "iso-date";
  const v = String(value).trim();
  if (v === "") return "empty";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return "iso-date";
  if (/^\d{4}-\d{2}$/.test(v)) return "iso-month";
  if (/^\d{2}\/\d{4}$/.test(v)) return "mm/yyyy";
  if (/^\d{2}\/\d{2}$/.test(v)) return "mm/yy";
  if (/^\d{4}$/.test(v)) return "yyyy";
  return "unparseable";
}

/** A `date` column cannot take "01/2008" — coerce what we can, report the rest. */
export function toDateOrNull(value) {
  const kind = classifyLooseDate(value);
  if (value instanceof Date) {
    if (kind === "unparseable") return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const v = String(value ?? "").trim();
  if (kind === "iso-date") return v;
  if (kind === "iso-month") return `${v}-01`;
  if (kind === "mm/yyyy") return `${v.slice(3)}-${v.slice(0, 2)}-01`;
  if (kind === "yyyy") return `${v}-01-01`;
  return null; // empty, mm/yy (ambiguous century) and unparseable
}

/** V1 core_field_settings.field_type -> the vocabulary schema_fields documents. */
export function mapFieldType(v1Type) {
  return v1Type === "multi-select" ? "multi_select" : v1Type;
}

// ── DB plumbing ─────────────────────────────────────────────────────────────

export function v3UrlFromEnv() {
  if (process.env.V3_DATABASE_URL) return process.env.V3_DATABASE_URL;
  dotenv.config({ path: path.join(BACKEND_ROOT, ".env"), quiet: true });
  const { DB_USERNAME, DB_PASSWORD, DB_NAME, DB_HOST = "localhost", DB_PORT = "5432" } = process.env;
  if (!DB_USERNAME || !DB_NAME) return null;
  const auth = `${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(DB_PASSWORD ?? "")}`;
  return `postgresql://${auth}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

export async function connect(connectionString, label, { readOnly = false } = {}) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`${label}: cannot connect — ${err.message}`);
  }
  if (readOnly) await client.query("SET default_transaction_read_only = on");
  return client;
}

/**
 * Connect (V1 pinned read-only), run `fn` inside one transaction, then COMMIT on
 * --apply and ROLLBACK otherwise. A dry run therefore exercises every constraint
 * the real load would hit — the only difference is the last statement.
 */
export async function withMigration({ apply, label }, fn) {
  const v1Url = process.env.V1_DATABASE_URL;
  if (!v1Url) {
    console.error("V1_DATABASE_URL is not set (the restored V1 database).");
    process.exit(2);
  }
  const v3Url = v3UrlFromEnv();
  if (!v3Url) {
    console.error("No V3 connection: set V3_DATABASE_URL or DB_USERNAME/DB_NAME in backend/.env");
    process.exit(2);
  }

  let v1, v3;
  try {
    v1 = await connect(v1Url, "V1", { readOnly: true });
    v3 = await connect(v3Url, "V3");
    console.log(`\n=== ${label} ===`);
    console.log(apply ? "mode: APPLY (writing)\n" : "mode: DRY RUN (rolled back)\n");

    await v3.query("BEGIN");
    const result = await fn(v1, v3);
    await v3.query(apply ? "COMMIT" : "ROLLBACK");
    if (!apply) console.log("\nnothing was written — re-run with --apply");
    return result;
  } catch (err) {
    if (v3) await v3.query("ROLLBACK").catch(() => {});
    console.error(`${label} failed: ${err.message}`);
    process.exitCode = 1;
    return null;
  } finally {
    await v1?.end().catch(() => {});
    await v3?.end().catch(() => {});
  }
}

/** Columns actually present on a table — lets a script degrade instead of crashing
 *  when a column another wave owns has not landed yet. */
export async function tableColumns(client, schema, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return new Set(rows.map((r) => r.column_name));
}

/**
 * Natural-key upsert. `match` is a {column-or-expression: value} object used to
 * find the existing row; keys containing "(" are match-only expressions and must
 * also appear in `values` for the INSERT.
 *
 * Written as SELECT-then-INSERT/UPDATE rather than ON CONFLICT because several
 * V3 targets (accreditations, cities) have no unique constraint to infer, and one
 * uniform path keeps every importer idempotent the same way.
 */
export async function upsertBy(client, table, match, values, { idColumn = "id" } = {}) {
  const matchKeys = Object.keys(match);
  const where = matchKeys.map((k, i) => `${k} = $${i + 1}`).join(" AND ");
  const found = await client.query(
    `SELECT ${idColumn} AS id FROM ${table} WHERE ${where} LIMIT 1`,
    Object.values(match),
  );

  if (found.rows.length > 0) {
    const cols = Object.keys(values);
    if (cols.length > 0) {
      const set = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
      await client.query(
        `UPDATE ${table} SET ${set} WHERE ${idColumn} = $${cols.length + 1}`,
        [...Object.values(values), found.rows[0].id],
      );
    }
    return { id: found.rows[0].id, inserted: false };
  }

  const insertCols = Object.keys(values);
  const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await client.query(
    `INSERT INTO ${table} (${insertCols.join(", ")}) VALUES (${placeholders}) RETURNING ${idColumn} AS id`,
    Object.values(values),
  );
  return { id: rows[0].id, inserted: true };
}

/** Report section printer: hides empty buckets, never prints a bare number for a failure. */
export function printList(title, items, render = (x) => JSON.stringify(x)) {
  if (!items || items.length === 0) return;
  console.log(`${title} (${items.length}):`);
  for (const item of items) console.log(`   ${render(item)}`);
}
