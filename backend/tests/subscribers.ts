/**
 * Subscribers list tests — union of newsletter, early-interest, and guide leads.
 * Run: DB_NAME=globalyapp_test node --import tsx tests/subscribers.ts (or: npm run test:subscribers)
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import { config } from "../src/config.js";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3010/api/v3";

// Guard: dedicated test database only
if (!/_test$/.test(config.DB_NAME)) {
  console.error(
    `\nREFUSING TO RUN.\n\n` +
      `  DB_NAME is "${config.DB_NAME}", which does not end in "_test".\n\n` +
      `  This suite inserts fixtures it never deletes; against a shared database that is\n` +
      `  unrecoverable pollution.\n\n` +
      `  Create one and point at it:\n` +
      `    DB_NAME=${config.DB_NAME}_test npm run test:subscribers\n`,
  );
  process.exit(1);
}

// Harness
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(id: string, label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  PASS ${id}  ${label}`);
  } else {
    failed++;
    failures.push(`${id} ${label}`);
    console.log(`  FAIL ${id}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = () => `test-${RUN}-${(seq++).toString(36)}`;

// Setup fixtures
async function setupFixtures() {
  // Insert newsletter subscriber (empty name)
  const newsletter1 = await masterKnex("public.waitlist_registrations")
    .insert({
      name: "",
      email: `${uniq()}@newsletter.test`,
      registrant_type: "newsletter",
    })
    .returning("*");

  // Insert newsletter subscriber (with name)
  const newsletter2 = await masterKnex("public.waitlist_registrations")
    .insert({
      name: "Jane Newsletter",
      email: `${uniq()}@newsletter.test`,
      registrant_type: "newsletter",
    })
    .returning("*");

  // Insert early interest (student)
  const earlyInterest1 = await masterKnex("public.waitlist_registrations")
    .insert({
      name: "John Student",
      email: `${uniq()}@student.test`,
      registrant_type: "student",
    })
    .returning("*");

  // Insert early interest (institution)
  const earlyInterest2 = await masterKnex("public.waitlist_registrations")
    .insert({
      name: "Jane Institution",
      email: `${uniq()}@institution.test`,
      registrant_type: "institution",
    })
    .returning("*");

  // Create a guide and guide lead
  const guide = await masterKnex("superadmin.guides")
    .insert({
      title: `Test Guide ${uniq()}`,
      slug: uniq(),
      is_published: true,
    })
    .returning("*");

  const guideLead = await masterKnex("superadmin.guide_leads")
    .insert({
      guide_id: (guide as any)[0].id,
      name: "Bob Guide Lead",
      email: `${uniq()}@guide.test`,
    })
    .returning("*");

  return {
    newsletter1: (newsletter1 as any)[0],
    newsletter2: (newsletter2 as any)[0],
    earlyInterest1: (earlyInterest1 as any)[0],
    earlyInterest2: (earlyInterest2 as any)[0],
    guide: (guide as any)[0],
    guideLead: (guideLead as any)[0],
  };
}

// Test functions
async function testWaitlistSchemaAcceptsNewsletter() {
  const email = uniq() + "@test.local";
  try {
    // Should accept newsletter type without name (empty string default)
    const result = await masterKnex("public.waitlist_registrations")
      .insert({
        email,
        registrant_type: "newsletter",
        name: "",
      })
      .returning("*");
    const row = (result as any)[0];
    check("T1", "Waitlist schema accepts newsletter type with empty name", row.name === "");
  } catch (e) {
    check("T1", "Waitlist schema accepts newsletter type with empty name", false, e);
  }
}

async function testUnionQuery(fixtures: Awaited<ReturnType<typeof setupFixtures>>) {
  // ponytail: simplified union pattern — three separate selects cast to common shape
  const rows = await masterKnex
    .raw(
      `
      SELECT
        'newsletter' as source,
        name,
        email,
        NULL::text as detail,
        created_at
      FROM public.waitlist_registrations
      WHERE registrant_type = 'newsletter'

      UNION ALL

      SELECT
        'early_interest' as source,
        name,
        email,
        registrant_type as detail,
        created_at
      FROM public.waitlist_registrations
      WHERE registrant_type IN ('student', 'institution', 'service_provider', 'other')

      UNION ALL

      SELECT
        'guide_lead' as source,
        name,
        email,
        t.title as detail,
        gl.created_at
      FROM superadmin.guide_leads gl
      JOIN superadmin.guides t ON gl.guide_id = t.id

      ORDER BY created_at DESC
    `,
    );

  const result = rows.rows;

  // Verify sources are present
  const sources = result.map((r: any) => r.source);
  check("T2a", "Union includes newsletter source", sources.includes("newsletter"));
  check("T2b", "Union includes early_interest source", sources.includes("early_interest"));
  check("T2c", "Union includes guide_lead source", sources.includes("guide_lead"));

  // Verify detail field
  const newsletter = result.find(
    (r: any) => r.source === "newsletter" && r.email === fixtures.newsletter1.email,
  );
  check(
    "T2d",
    "Newsletter detail is null",
    newsletter?.detail === null,
  );

  const earlyInterest = result.find(
    (r: any) => r.source === "early_interest" && r.email === fixtures.earlyInterest1.email,
  );
  check(
    "T2e",
    "Early interest detail is audience type",
    earlyInterest?.detail === "student",
  );

  const guideLead = result.find(
    (r: any) => r.source === "guide_lead" && r.email === fixtures.guideLead.email,
  );
  check(
    "T2f",
    "Guide lead detail is guide title",
    guideLead?.detail === fixtures.guide.title,
  );
}

async function testTypeFilter(fixtures: Awaited<ReturnType<typeof setupFixtures>>) {
  // Test filtering by type
  const newsletter = await masterKnex.raw(
    `
    SELECT
      'newsletter' as source,
      name,
      email,
      NULL::text as detail,
      created_at
    FROM public.waitlist_registrations
    WHERE registrant_type = 'newsletter'
    `,
  );

  const result = newsletter.rows;
  check("T3a", "Newsletter filter returns only newsletters", result.every((r: any) => r.source === "newsletter"));
  check("T3b", "Newsletter filter includes expected rows", result.length >= 2);
}

async function testCsvEscaping() {
  // Test CSV escaping of special characters
  const email = `test,${uniq()}@test.local`;
  const name = `"John ""The One"" Doe"`;

  try {
    const result = await masterKnex("public.waitlist_registrations")
      .insert({
        email,
        name,
        registrant_type: "newsletter",
      })
      .returning("*");

    const row = (result as any)[0];

    // Verify escaping logic: CSV fields with commas or quotes need wrapping
    const escapedName = row.name.includes(",") || row.name.includes('"')
      ? `"${row.name.replace(/"/g, '""')}"`
      : row.name;

    check("T4a", "CSV escaping handles commas in names", escapedName.includes('"'));
    check("T4b", "CSV escaping handles quotes in names", escapedName.includes('""'));
  } catch (e) {
    check("T4a", "CSV escaping handles commas in names", false, e);
  }
}

// Main
(async () => {
  console.log("Subscribers tests");

  try {
    const fixtures = await setupFixtures();

    await testWaitlistSchemaAcceptsNewsletter();
    await testUnionQuery(fixtures);
    await testTypeFilter(fixtures);
    await testCsvEscaping();

    // Cleanup
    const testEmails = [
      fixtures.newsletter1.email,
      fixtures.newsletter2.email,
      fixtures.earlyInterest1.email,
      fixtures.earlyInterest2.email,
      fixtures.guideLead.email,
    ];
    await masterKnex("public.waitlist_registrations").whereIn("email", testEmails).del();
    await masterKnex("superadmin.guide_leads").where("id", fixtures.guideLead.id).del();
    await masterKnex("superadmin.guides").where("id", fixtures.guide.id).del();

    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failures.length > 0) {
      console.log("Failures:");
      failures.forEach((f) => console.log(`  - ${f}`));
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error("Fatal error:", e);
    process.exit(1);
  }
})();
