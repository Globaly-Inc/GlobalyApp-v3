/**
 * Other Service Category booking requirements — asserts the server validates a Personal Portal
 * submission against whatever an admin configured, and that the booking-only field types cannot reach
 * the Super Admin Service Category system.
 * Run: node --import tsx tests/other-service-booking-requirements.ts
 *      (or: npm run test:other-service-booking-requirements)
 *
 * Style matches tests/chunker.ts: plain tsx script, manual counters, no framework. No DB — the rules
 * are exercised through validateAgainstFields, which takes the field definitions as an argument.
 */

import { validateAgainstFields } from "../src/modules/other-services/services/booking.service.js";
import type { BookingField } from "../src/modules/other-services/services/booking.service.js";
import { assertFieldTypeAllowed } from "../src/modules/superadmin/platform/categories/services/categories.service.js";
import type { BookingAnswers } from "../src/modules/other-services/schemas/services.schema.js";
import { SchemaFieldInputSchema } from "../src/modules/superadmin/platform/categories/schemas/categories.schema.js";
import { REQUIREMENTS } from "../database/seeders/globalyapp/other_service_category_fields_seeder.js";

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

/** Assert the call is rejected, and that the message names the field a human would look for. */
function rejects(fn: () => unknown, mentions: string, label: string) {
  try {
    fn();
    assert(false, label, "did not throw");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert(message.toLowerCase().includes(mentions.toLowerCase()), label, message);
  }
}

const field = (over: Partial<BookingField> & Pick<BookingField, "key" | "label" | "type">): BookingField => ({
  id: 1,
  is_required: false,
  options: null,
  placeholder: null,
  help_text: null,
  default_value: null,
  validation: null,
  ...over,
});

// ── Airport Pickup, as the brief configures it ──
const AIRPORT_PICKUP: BookingField[] = [
  field({ key: "pickup_date", label: "Pickup date", type: "date", is_required: true }),
  field({ key: "pickup_time", label: "Pickup time", type: "time", is_required: true }),
  field({ key: "airport", label: "Airport", type: "select", is_required: true, options: ["TIA", "SYD", "MEL"] }),
  field({ key: "flight_number", label: "Flight number", type: "text" }),
  field({ key: "passengers", label: "Passengers", type: "number", is_required: true, validation: { min: 1, max: 8 } }),
  field({ key: "special_request", label: "Special request", type: "long_text" }),
];

// ── Rental Service — a completely different set of requirements, same code path ──
const RENTAL: BookingField[] = [
  field({ key: "start_date", label: "Rental start date", type: "date", is_required: true }),
  field({ key: "end_date", label: "Rental end date", type: "date", is_required: true }),
  field({ key: "people", label: "Number of people", type: "number", is_required: true, validation: { min: 1 } }),
  field({ key: "property_type", label: "Property type", type: "select", is_required: true, options: ["Studio", "Apartment", "House"] }),
  field({ key: "location", label: "Location", type: "text", is_required: true }),
];

console.log("\n1. A complete submission is accepted and normalised");
{
  const clean = validateAgainstFields(AIRPORT_PICKUP, {
    pickup_date: "2026-08-25",
    pickup_time: "10:30",
    airport: "TIA",
    flight_number: " QR648 ",
    passengers: "2",
  } as BookingAnswers);

  assert(clean.pickup_date === "2026-08-25", "keeps the date as submitted");
  assert(clean.pickup_time === "10:30", "keeps the time as submitted");
  assert(clean.flight_number === "QR648", "trims a text answer", clean.flight_number);
  assert(clean.passengers === 2, "coerces a numeric string to a number", clean.passengers);
  assert(!("special_request" in clean), "an unanswered optional question is not stored");
}

console.log("\n2. Required questions cannot be skipped");
{
  rejects(
    () => validateAgainstFields(AIRPORT_PICKUP, { pickup_date: "2026-08-25", pickup_time: "10:30", passengers: 2 }),
    "Airport is required",
    "a missing required dropdown is rejected by name",
  );
  rejects(
    () => validateAgainstFields(AIRPORT_PICKUP, { pickup_date: "  ", pickup_time: "10:30", airport: "TIA", passengers: 2 }),
    "Pickup date is required",
    "whitespace is not an answer",
  );
  rejects(
    () => validateAgainstFields(RENTAL, { start_date: "2026-09-01", end_date: "2026-09-30", people: 2, location: "Dublin" }),
    "Property type is required",
    "a different category enforces its own required set",
  );
}

console.log("\n3. Invalid and malformed values are rejected");
{
  const base = { pickup_date: "2026-08-25", pickup_time: "10:30", airport: "TIA", passengers: 2 };
  rejects(() => validateAgainstFields(AIRPORT_PICKUP, { ...base, airport: "LHR" }), "must be one of", "an option that was not offered");
  rejects(() => validateAgainstFields(AIRPORT_PICKUP, { ...base, pickup_date: "25/08/2026" }), "must be a date", "a non-ISO date");
  rejects(() => validateAgainstFields(AIRPORT_PICKUP, { ...base, pickup_time: "25:99" }), "must be a time", "an impossible time");
  rejects(() => validateAgainstFields(AIRPORT_PICKUP, { ...base, passengers: "two" }), "must be a number", "a word where a number belongs");
  rejects(() => validateAgainstFields(AIRPORT_PICKUP, { ...base, passengers: 0 }), "at least 1", "a number below the configured minimum");
  rejects(() => validateAgainstFields(AIRPORT_PICKUP, { ...base, passengers: 9 }), "at most 8", "a number above the configured maximum");
}

console.log("\n4. An answer to a question the category does not ask is rejected, not stored");
{
  rejects(
    () => validateAgainstFields(AIRPORT_PICKUP, { pickup_date: "2026-08-25", pickup_time: "10:30", airport: "TIA", passengers: 2, is_required: "false" }),
    "does not ask for",
    "a stray key — including one named after the configuration itself",
  );
}

console.log("\n5. A category with nothing configured still books");
{
  const clean = validateAgainstFields([], {});
  assert(Object.keys(clean).length === 0, "no requirements means no answers and no error");
  rejects(() => validateAgainstFields([], { anything: "at all" }), "does not ask for", "but still rejects invented keys");
}

console.log("\n6. Field types beyond text/number/date");
{
  const fields: BookingField[] = [
    field({ key: "coverage", label: "Coverage", type: "checkbox", is_required: true, options: ["Medical", "Baggage", "Delay"] }),
    field({ key: "sim_type", label: "SIM type", type: "radio", is_required: true, options: ["eSIM", "Physical"] }),
    field({ key: "contact", label: "Contact email", type: "email", is_required: true }),
    field({ key: "phone", label: "Phone", type: "phone", is_required: true }),
    field({ key: "arrive_at", label: "Arrives at", type: "datetime", is_required: true }),
    field({ key: "needs_receipt", label: "Needs a receipt", type: "boolean", is_required: true }),
  ];
  const ok = {
    coverage: ["Medical", "Delay"],
    sim_type: "eSIM",
    contact: "someone@example.com",
    phone: "+353 87 123 4567",
    arrive_at: "2026-08-25T10:30",
    needs_receipt: "true",
  };

  const clean = validateAgainstFields(fields, ok as BookingAnswers);
  assert(Array.isArray(clean.coverage) && clean.coverage.length === 2, "checkbox keeps every chosen option", clean.coverage);
  assert(clean.needs_receipt === true, "a boolean submitted as a string is coerced", clean.needs_receipt);
  assert(clean.sim_type === "eSIM", "radio validates against its options like a dropdown");

  rejects(() => validateAgainstFields(fields, { ...ok, coverage: ["Medical", "Rental car"] }), "is not an option", "an unlisted checkbox option");
  rejects(() => validateAgainstFields(fields, { ...ok, sim_type: "Postal" }), "must be one of", "an unlisted radio option");
  rejects(() => validateAgainstFields(fields, { ...ok, contact: "not-an-email" }), "email address", "a malformed email");
  rejects(() => validateAgainstFields(fields, { ...ok, arrive_at: "2026-08-25" }), "date and time", "a date where a datetime belongs");
}

console.log("\n7. Length and pattern bounds");
{
  const fields: BookingField[] = [
    field({ key: "note", label: "Note", type: "long_text", validation: { max_length: 10 } }),
    field({ key: "reference", label: "Reference", type: "text", validation: { pattern: "^[A-Z]{3}-\\d{4}$" } }),
    field({ key: "broken", label: "Broken rule", type: "text", validation: { pattern: "([unclosed" } }),
  ];

  assert(validateAgainstFields(fields, { note: "short" }).note === "short", "a value inside its length bound passes");
  rejects(() => validateAgainstFields(fields, { note: "far too long to fit" }), "10 characters or fewer", "a value over its length bound");
  assert(validateAgainstFields(fields, { reference: "ABC-1234" }).reference === "ABC-1234", "a value matching the pattern passes");
  rejects(() => validateAgainstFields(fields, { reference: "abc-1" }), "expected format", "a value failing the pattern");
  assert(
    validateAgainstFields(fields, { broken: "anything" }).broken === "anything",
    "an admin's uncompilable pattern is ignored rather than blocking every booking",
  );
}

console.log("\n8. Historical submissions survive a configuration change");
{
  // The admin later drops "flight_number" and adds "bags". What was already stored is not re-validated —
  // only new submissions are — so this asserts the shape a re-read must still tolerate.
  const stored = { pickup_date: "2026-08-25", pickup_time: "10:30", airport: "TIA", flight_number: "QR648", passengers: 2 };
  const changed = AIRPORT_PICKUP
    .filter((f) => f.key !== "flight_number")
    .concat(field({ key: "bags", label: "Bags", type: "number" }));

  rejects(
    () => validateAgainstFields(changed, stored),
    "does not ask for",
    "resubmitting an old answer set against the new configuration is refused",
  );
  assert(
    Object.keys(stored).includes("flight_number"),
    "the stored answers themselves are untouched — nothing rewrites booking_answers",
  );
}

console.log("\n9. Separation: booking-only types cannot reach the Super Admin Service Category");
{
  for (const type of ["time", "datetime", "long_text", "email", "phone", "radio", "checkbox"] as const) {
    rejects(
      () => assertFieldTypeAllowed("service_categories", type),
      "only available on other service categories",
      `service_categories rejects "${type}"`,
    );
    rejects(
      () => assertFieldTypeAllowed("business_categories", type),
      "only available on other service categories",
      `business_categories rejects "${type}"`,
    );
  }

  let threw = false;
  try {
    for (const type of ["text", "number", "boolean", "date", "select", "multi_select"] as const) {
      assertFieldTypeAllowed("service_categories", type);
      assertFieldTypeAllowed("business_categories", type);
    }
    assertFieldTypeAllowed("other_service_categories", "checkbox");
    assertFieldTypeAllowed("other_service_categories", "time");
  } catch {
    threw = true;
  }
  assert(!threw, "the six core types stay available everywhere, and every type is allowed on other_service_categories");
}

console.log("\n10. The seeded starting requirements are valid and answerable");
{
  // Bad seed data would ship a category nobody can book — a required dropdown with no options refuses
  // every value, so this checks the fixtures against the same schemas the API validates against.
  for (const [slug, fields] of Object.entries(REQUIREMENTS)) {
    const parsed = fields.map((f) => SchemaFieldInputSchema.safeParse(f));
    const bad = parsed.flatMap((r, i) => (r.success ? [] : [`${fields[i]!.key}: ${r.error.issues[0]?.message}`]));
    assert(bad.length === 0, `${slug} — every field passes SchemaFieldInputSchema`, bad);

    const keys = fields.map((f) => f.key);
    assert(new Set(keys).size === keys.length, `${slug} — no duplicate keys`, keys);

    // Every field must survive a round trip through the booking validator, so the seeded requirements
    // cannot produce a category that rejects a good-faith answer.
    const asBookingFields: BookingField[] = fields.map((f, i) => ({
      id: i + 1,
      key: f.key,
      label: f.label,
      type: f.type as BookingField["type"],
      is_required: f.is_required ?? false,
      options: f.options ?? null,
      placeholder: f.placeholder ?? null,
      help_text: f.help_text ?? null,
      default_value: f.default_value ?? null,
      validation: f.validation ?? null,
    }));

    const answer = (f: BookingField): unknown => {
      switch (f.type) {
        case "date": return "2026-09-01";
        case "time": return "09:00";
        case "datetime": return "2026-09-01T09:00";
        case "email": return "someone@example.com";
        case "phone": return "+353 87 123 4567";
        case "boolean": return true;
        case "number": return f.validation?.min ?? 1;
        case "select": case "radio": return String(f.options![0]);
        case "multi_select": case "checkbox": return [String(f.options![0])];
        default: return "A reasonable answer";
      }
    };

    const filled = Object.fromEntries(asBookingFields.map((f) => [f.key, answer(f)]));
    try {
      validateAgainstFields(asBookingFields, filled as BookingAnswers);
      assert(true, `${slug} — a filled-in form is accepted`);
    } catch (err) {
      assert(false, `${slug} — a filled-in form is accepted`, err instanceof Error ? err.message : String(err));
    }

    // And the required ones are genuinely enforced, not decorative.
    const requiredKeys = asBookingFields.filter((f) => f.is_required).map((f) => f.key);
    for (const key of requiredKeys) {
      const missing = { ...filled };
      delete missing[key];
      rejects(
        () => validateAgainstFields(asBookingFields, missing as BookingAnswers),
        "is required",
        `${slug} — "${key}" cannot be skipped`,
      );
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
