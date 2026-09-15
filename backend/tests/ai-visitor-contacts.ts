/**
 * Widget visitor contacts — the identity a business gets when the visitor never gives a name.
 *
 * The parts that silently break the feature:
 *   1. detail extraction: an email typed mid-sentence is the contact; a course code is not a phone
 *   2. the label ladder: email → phone → device+IP, never an indistinguishable row
 *   3. the upsert's two COALESCE directions — device follows the visitor, email/phone stick
 *   4. contacts are tenant-schema rows, so the business and institution templates must match
 *
 * Run: node --import tsx tests/ai-visitor-contacts.ts   (or: npm run test:visitor-contacts)
 *
 * Pure helpers plus one pg-catalog read — never writes.
 */

import "dotenv/config";
import { readFileSync } from "fs";
import type { Knex } from "knex";
import { masterKnex } from "../src/core/db/master-pool.js";
import { extractContactDetails } from "../src/modules/ai-counsellor/services/guest.service.js";
import { contactLabel, deviceLabel } from "../src/modules/ai-counsellor/services/embed.service.js";
import * as contactsRepo from "../src/modules/ai-counsellor/repositories/contacts.repository.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const contact = (over: Partial<contactsRepo.WidgetContactRow> = {}): contactsRepo.WidgetContactRow => ({
  id: 1,
  session_id: 7,
  embed_config_id: 1,
  visitor_ip: null,
  visitor_user_agent: null,
  visitor_email: null,
  visitor_phone: null,
  message_count: 3,
  created_at: new Date(),
  updated_at: new Date(),
  ...over,
});

console.log("\n1. contact details out of free text");
{
  assert(
    extractContactDetails("sure, mail me at Sam.O+uni@example.co.uk tomorrow").email === "sam.o+uni@example.co.uk",
    "an email mid-sentence is captured and lowercased",
  );
  assert(
    extractContactDetails("call me on +977 9812-345678").phone === "+977 9812-345678",
    "a phone mid-sentence is captured",
  );
  // The reason PHONE_PATTERN needs 8+ digits: the widget answers course questions all day.
  assert(
    extractContactDetails("is CHC52021 still open for 2026 intake?").phone === undefined,
    "a course code / year is not a phone number",
    extractContactDetails("is CHC52021 still open for 2026 intake?"),
  );
  assert(
    extractContactDetails("hi, what courses do you have?").email === undefined,
    "a plain question yields nothing",
  );
  const both = extractContactDetails("reach me: 12345678901@example.com");
  assert(both.email === "12345678901@example.com" && both.phone === undefined,
    "digits inside an email are not also reported as a phone", both);
}

console.log("\n2. the label ladder");
{
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
  assert(deviceLabel(ua) === "Chrome on Windows", "UA → browser on OS", deviceLabel(ua));
  assert(deviceLabel(null) === null, "no UA → no device label");
  assert(
    contactLabel(contact({ visitor_email: "a@b.com", visitor_phone: "123", visitor_ip: "1.2.3.4" })) === "a@b.com",
    "an email outranks everything else",
  );
  assert(
    contactLabel(contact({ visitor_phone: "+9779812345678", visitor_ip: "1.2.3.4" })) === "+9779812345678",
    "a phone outranks the device",
  );
  assert(
    contactLabel(contact({ visitor_user_agent: ua, visitor_ip: "103.5.150.9" })) === "Chrome on Windows · 103.5.150.9",
    "an unnamed visitor is still identifiable by device and IP",
    contactLabel(contact({ visitor_user_agent: ua, visitor_ip: "103.5.150.9" })),
  );
  assert(
    contactLabel(contact()) === "Visitor #7",
    "a visitor who leaves nothing at all still gets a distinct label",
  );
}

console.log("\n3. the upsert keeps the right value on each column");
{
  // The real emitted SQL, captured through a stub db — the two COALESCE directions are the
  // whole point of the upsert, and swapping either silently loses data already in the row.
  let sql = "";
  let bindings: unknown[] = [];
  const stub = {
    raw: (text: string, binds: unknown[]) => {
      sql = text;
      bindings = binds;
      return Promise.resolve();
    },
  } as unknown as Knex;

  await contactsRepo.recordTurn(stub, {
    sessionId: 7,
    embedConfigId: 1,
    ip: "103.5.150.9",
    userAgent: "x".repeat(900),
    email: "a@b.com",
  });

  assert(
    /visitor_ip\s*=\s*COALESCE\(EXCLUDED\.visitor_ip/.test(sql),
    "device and IP follow the visitor — newest wins",
  );
  assert(
    /visitor_email\s*=\s*COALESCE\(ai_widget_contacts\.visitor_email,\s*EXCLUDED/.test(sql),
    "a captured email is never overwritten by a later empty turn",
  );
  assert(
    /visitor_phone\s*=\s*COALESCE\(ai_widget_contacts\.visitor_phone,\s*EXCLUDED/.test(sql),
    "a captured phone is never overwritten by a later empty turn",
  );
  assert(sql.includes("ON CONFLICT (session_id)"), "two tabs on one site stay one contact");
  assert(String(bindings[3]).length === 500, "a hostile user-agent header is truncated", String(bindings[3]).length);
  assert(bindings[5] === null, "a turn with no phone binds null, not undefined", bindings[5]);
}

console.log("\n4. contacts live in the tenant schema, not globalyapp");
{
  const central = await masterKnex("information_schema.columns")
    .where({ table_name: "ai_counselor_sessions" })
    .pluck("column_name");
  assert(
    !central.includes("visitor_ip"),
    "the shared session table carries no visitor identity",
    central.filter((c: string) => c.startsWith("visitor_")),
  );

  // Both org kinds work their contacts in the same portal screens, which read
  // req.db("ai_widget_contacts") — so the two templates have to stay identical.
  const business = readFileSync("database/migrations/business/20260915_001_ai_widget_contacts.ts", "utf8");
  const institution = readFileSync("database/migrations/institution/20260915_001_ai_widget_contacts.ts", "utf8");
  const body = (file: string) => file.slice(file.indexOf("export async function up"));
  assert(body(business) === body(institution), "the business and institution templates match");
  assert(
    business.includes('createTable("ai_widget_contacts"') && institution.includes('createTable("ai_widget_contacts"'),
    "both templates create the same table name",
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
await masterKnex.destroy();
process.exit(failed ? 1 : 0);
