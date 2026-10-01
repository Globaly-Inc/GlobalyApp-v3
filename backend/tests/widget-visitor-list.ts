/**
 * AI embed visitor/lead list test — the SQL behind the Visitors tab.
 *
 * The things that break this feature silently rather than loudly:
 *   1. the Visitors tab listing leads (or vice versa) — one inverted null check
 *   2. the Status column and the tab filter disagreeing about the same row
 *   3. `visitor_key` — sha256(browser fingerprint : embed key) — reaching the browser
 *   4. search matching only one of the two columns it claims to search
 *
 * Run: node --import tsx tests/widget-visitor-list.ts  (or: npm run test:widget-visitor-list)
 *
 * NO DATABASE. Knex is constructed as a pg dialect with no connection, so the builders can be
 * rendered to SQL and read. Tenant isolation is deliberately NOT asserted here: it is the
 * connection (req.db → tenant schema), not a clause in these queries, so there is nothing in
 * the SQL to assert it with.
 */

import knexLib from "knex";
import { countsQuery, listQuery } from "../src/modules/ai-counsellor/repositories/visitors.repository.js";

const db = knexLib({ client: "pg" });

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${detail}`}`);
  }
}

const page = { page: 1, limit: 20 };
const sqlFor = (status: "all" | "visitor" | "lead", search?: string) =>
  listQuery(db, { ...page, status, search }).toString();

console.log("\n1. status filter");
{
  const visitors = sqlFor("visitor");
  const leads = sqlFor("lead");
  const all = sqlFor("all");

  assert(/"status" = 'visitor'/.test(visitors), "Visitors tab filters on status = 'visitor'", visitors);
  assert(/"status" = 'lead'/.test(leads), "Leads tab filters on status = 'lead'", leads);
  assert(!/where "status"/.test(all), "All tab filters on neither", all);
}

console.log("\n2. the badge and the filter read the same column");
{
  const all = sqlFor("all");
  // The row's badge is this column and the tab filter is this column. One source, so a row can
  // never appear under "Leads" wearing a "Visitor" badge.
  assert(/select .*"status"/.test(all), "status is selected as a stored column", all);
  assert(!/case when/i.test(all), "status is no longer computed in the query", all);
}

console.log("\n3. the tenant sees only what it should");
{
  const all = sqlFor("all");
  assert(!/visitor_key/.test(all), "visitor_key is never selected", all);
  assert(!/summary_error/.test(all), "summary_error is never selected", all);
  assert(!/select \*/i.test(all), "columns are an allow-list, not select *", all);
  assert(/"name"/.test(all) && /"email"/.test(all) && /"message_count"/.test(all), "the list's own columns are there", all);
}

console.log("\n4. search");
{
  const searched = sqlFor("all", "jo");
  assert(/"name" ilike/i.test(searched), "search matches name", searched);
  assert(/or "email" ilike/i.test(searched), "search also matches email", searched);
  assert(/or "study_preference" ilike/i.test(searched), "search also matches the programme", searched);
  assert(searched.includes("%jo%"), "search is a contains match", searched);
  // The OR must be parenthesised, or on the Leads tab it would swallow the status filter and
  // return every searched visitor as a lead.
  assert(/\(.*ilike.*or.*ilike.*\)/is.test(sqlFor("lead", "jo")), "the OR is grouped, not flattened into the status filter", sqlFor("lead", "jo"));
}

console.log("\n5. counts");
{
  const counts = countsQuery(db, { search: "jo" }).toString();
  // Counted off the same column the Leads tab filters on, so a tab cannot show a tally its own
  // list contradicts.
  assert(/FILTER \(WHERE status = 'lead'\)/.test(counts), "leads are counted off the status column", counts);
  assert(/CAST\(count\(\*\) AS int\)/.test(counts), "the total is counted once", counts);
  assert(/ilike/i.test(counts), "counts respect the search term", counts);
  assert(!/limit/i.test(counts), "counts are not paginated", counts);
}

console.log("\n6. paging and order");
{
  assert(/order by "last_activity_at" desc/i.test(sqlFor("all")), "newest activity first", sqlFor("all"));
  const second = listQuery(db, { page: 3, limit: 10, status: "all" }).toString();
  assert(/limit 10 offset 20/i.test(second), "page 3 of 10 starts at offset 20", second);
}

console.log("\n7. the status migration (business + institution twins)");
{
  // `tsc` never looks at database/ — tsconfig's include is src/** — so nothing else in the
  // verification path would catch a syntax error or a bad export here. Importing the file is
  // what exercises the same esbuild transform `migrate:tenants` uses.
  //
  // The fake knex also catches the silent-rewrite hazard: knex.raw parses `?` and `:name` as
  // bindings, so a `::text` cast or a regex quantifier ships as `$1` with no error anywhere.
  for (const template of ["business", "institution"]) {
    const mod = await import(`../database/migrations/${template}/20260923_001_ai_widget_visitors_status.ts`);
    assert(typeof mod.up === "function" && typeof mod.down === "function", `${template}: exports up and down`);

    for (const direction of ["up", "down"] as const) {
      const statements: string[] = [];
      await mod[direction]({ raw: async (sql: string) => { statements.push(sql); } });
      assert(statements.length > 0, `${template}.${direction}: runs at least one statement`);
      assert(
        statements.every((s) => !/\?|:\w/.test(s)),
        `${template}.${direction}: no statement contains a knex binding token`,
        statements.find((s) => /\?|:\w/.test(s)),
      );
    }

    const up: string[] = [];
    await mod.up({ raw: async (sql: string) => { up.push(sql); } });
    const joined = up.join("\n");
    assert(/GENERATED ALWAYS AS/.test(joined), `${template}: status is a generated column`);
    assert(/STORED/.test(joined), `${template}: generated STORED, so it is indexable and readable`);
    // The rule the whole feature hangs on. If this expression ever stops matching what the read
    // side filters on, the Leads tab silently lists the wrong people.
    assert(
      /CASE WHEN email IS NULL THEN CAST\('visitor' AS text\) ELSE CAST\('lead' AS text\) END/.test(joined),
      `${template}: a visitor becomes a lead exactly when an email exists`,
      joined,
    );
    assert(/DROP COLUMN IF EXISTS status/.test((await (async () => {
      const down: string[] = [];
      await mod.down({ raw: async (sql: string) => { down.push(sql); } });
      return down.join("\n");
    })())), `${template}: down drops the column`);
  }
}

console.log("\n8. default is visitor, and the contact form is what promotes them");
{
  // The product rule in one place: a row starts with no email and is therefore a visitor, and
  // the ONLY thing that changes that is the card being filled in. Proved against the real
  // service functions with a fake knex, so it survives someone editing them.
  const { resolveVisitor, recordContact } = await import("../src/modules/ai-counsellor/services/visitor.service.js");

  function fakeDb(existing?: unknown) {
    const captured: { inserted?: Record<string, unknown>; updated?: Record<string, unknown> } = {};
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      where: () => builder,
      whereNot: () => builder,
      first: async () => existing,
      insert: (data: Record<string, unknown>) => { captured.inserted = data; return builder; },
      update: (data: Record<string, unknown>) => { captured.updated = data; return builder; },
      returning: async () => [{ id: 1 }],
    });
    const fake = () => builder;
    Object.assign(fake, { fn: { now: () => "now()" }, raw: (sql: string) => sql });
    return { db: fake as never, captured };
  }

  const fresh = fakeDb(undefined);
  await resolveVisitor(fresh.db, { visitorKey: "k", embedConfigId: 1, sessionId: null });
  const inserted = fresh.captured.inserted ?? {};
  assert(!("email" in inserted) && !("name" in inserted), "a new visitor is inserted with no name or email — so status defaults to 'visitor'", inserted);
  assert(!("status" in inserted), "the insert never names the generated status column", inserted);

  const submit = fakeDb(undefined);
  await recordContact(submit.db, { visitorKey: "k", embedConfigId: 1, action: "submit", name: "John Doe", email: "john@example.com" });
  const submitted = submit.captured.updated ?? {};
  assert(submitted.name === "John Doe" && submitted.email === "john@example.com", "submitting the card writes both name and email — which is what flips status to 'lead'", submitted);
  assert(!("status" in submitted), "the submit update never names the generated status column", submitted);

  const skip = fakeDb(undefined);
  await recordContact(skip.db, { visitorKey: "k", embedConfigId: 1, action: "skip" });
  const skipped = skip.captured.updated ?? {};
  assert(!("name" in skipped) && !("email" in skipped), "declining the card leaves name/email alone — they stay a visitor", skipped);
}

console.log("\n9. what an owner may edit");
{
  // The portal's edit form is the only thing that can put an invalid row in front of Postgres:
  // chk_ai_widget_visitors_contact_pair forbids half a contact, and `status` is GENERATED, so a
  // patch naming it errors rather than being ignored. Both are caught by the schema, not by a
  // round trip, so both are checked here.
  const { VisitorPatchSchema } = await import("../src/modules/ai-counsellor/schemas/visitor.schema.js");
  const ok = (body: unknown) => VisitorPatchSchema.safeParse(body).success;

  assert(ok({ name: "Jo", email: "jo@example.com" }), "name + email together is accepted");
  assert(ok({ name: null, email: null }), "clearing both together is accepted");
  assert(ok({ age: "early 30s" }), "a verbatim age is accepted, not parsed as a number");
  assert(ok({ nationality: "Nepal", study_preference: "BSc Computer Science" }), "the other stated fields are editable");

  // These three asserted the opposite until 20261001_002 dropped chk_ai_widget_visitors_contact_pair.
  // The halves are independent now, because a visitor who volunteers only "I'm John" has given
  // us a real name and no address — and the two refines that enforced the old rule here were
  // then REFUSING to add an email to such a row, which is why they went.
  assert(ok({ name: "Jo" }), "a name alone is accepted — a half contact is a real answer now");
  assert(ok({ email: "jo@example.com" }), "an email alone is accepted, and is what promotes them to a lead");
  assert(ok({ name: "Jo", email: null }), "setting one while clearing the other is a legitimate edit");
  assert(!ok({ name: "Jo", email: "not-an-email" }), "a malformed email is rejected here, not by the database");
  assert(!ok({}), "an empty patch is rejected rather than counted as a successful edit");

  // Strict, so a field outside the allow-list fails loudly instead of reaching the UPDATE.
  assert(!ok({ status: "lead" }), "status is rejected — it is GENERATED and writing it throws");
  assert(!ok({ message_count: 5 }), "the activity record is not the owner's to rewrite");
  assert(!ok({ nationality_raw: "Nepali" }), "the visitor's own wording is not overwritable");
}

console.log("\n10. the popups, the extractor and the patch schema agree");
{
  // The Personal Profile popups are the source of truth for what a record IS. Three places have
  // to hold the same field list — the popup, `PROFILE_FIELDS` (what the chat extractor may
  // return) and `VISITOR_ENTRY_SHAPES` (what an owner may send) — and only the last two are
  // reachable from here, so this pins them to each other. Break the chain in either direction
  // and an owner's correction stops being the same kind of thing as the visitor's own answer.
  const { PROFILE_FIELDS } = await import("../src/modules/ai-counsellor/lib/card-parser.js");
  const { VISITOR_ENTRY_SHAPES, VisitorPatchSchema } = await import("../src/modules/ai-counsellor/schemas/visitor.schema.js");
  const ok = (body: unknown) => VisitorPatchSchema.safeParse(body).success;

  for (const section of Object.keys(PROFILE_FIELDS) as (keyof typeof PROFILE_FIELDS)[]) {
    const extractor = [...PROFILE_FIELDS[section]].sort();
    const patch = Object.keys(VISITOR_ENTRY_SHAPES[section]).sort();
    assert(
      JSON.stringify(extractor) === JSON.stringify(patch),
      `${section}: the editable fields are exactly the extractable ones`,
      `extractor=${extractor.join(",")} patch=${patch.join(",")}`,
    );
  }

  const full = VisitorPatchSchema.safeParse({
    qualifications: [{
      qualification_type: "bachelor", degree_title: "Computer Science", subject_area: "IT",
      institution_name: "London Met", grading_system: "gpa_4", grade_value: "4",
      is_current: false, start_date: "2021-12-01", end_date: "2024-12-01",
    }],
  });
  assert(full.success, "a complete popup submission is accepted", JSON.stringify(full.error?.issues));

  // `sort_order` lives in the popup's Input TYPE but is not a field of the popup — the array's
  // own order is the order, and storing a second one invites the two to disagree.
  assert(!ok({ qualifications: [{ degree_title: "X", sort_order: 0 }] }), "sort_order is rejected");
  assert(!ok({ qualifications: [{ degree_title: "X", gpa: "4" }] }), "a field no popup has is rejected");

  // Blank fields must not become stored answers of nothing.
  const blanks = VisitorPatchSchema.safeParse({
    work_experiences: [{ job_title: "Dev", organization_name: "", end_date: "", is_current: true }],
  });
  const entry = blanks.success ? (blanks.data.work_experiences?.[0] as Record<string, unknown>) : {};
  assert(blanks.success && !("organization_name" in entry) && !("end_date" in entry), "empty popup fields are dropped, not stored as ''", JSON.stringify(entry));
  assert(entry.is_current === false || entry.is_current === true, "a boolean false survives the blank-stripping", JSON.stringify(entry));

  // Deleting the last entry stores [] — "asked, and none" — which is not the same as null.
  const cleared = VisitorPatchSchema.safeParse({ academic_tests: [] });
  assert(cleared.success && Array.isArray(cleared.data.academic_tests) && cleared.data.academic_tests.length === 0, "clearing a section is an empty array, not null");

  // Sub-scores are a flat map of strings; blanks inside are dropped the same way.
  const subs = VisitorPatchSchema.safeParse({
    language_tests: [{ test_type: "IELTS", sub_scores: { Reading: "7", Writing: "" } }],
  });
  const test = subs.success ? (subs.data.language_tests?.[0] as { sub_scores?: Record<string, string> }) : {};
  assert(subs.success && test.sub_scores?.Reading === "7" && !("Writing" in (test.sub_scores ?? {})), "a blank sub-score is dropped", JSON.stringify(test));
}

console.log("\n11. volunteered details, and the meta bag");
{
  // Same fakeDb shape as section 8 — the point is which columns each write names, because every
  // one of these is a product rule hiding in an UPDATE.
  const { recordMeta, recordVolunteeredContact } = await import("../src/modules/ai-counsellor/services/visitor.service.js");

  function fakeDb() {
    const captured: { updated?: Record<string, unknown>; sql?: string } = {};
    const builder: Record<string, unknown> = {};
    const note = (fragment: string) => { captured.sql = `${captured.sql ?? ""} ${fragment}`; };
    Object.assign(builder, {
      // knex's `where` takes an object OR a callback that builds a grouped clause. The callback
      // form is where the summary guard lives, so it has to be INVOKED, not just counted.
      where: (arg: unknown) => {
        if (typeof arg === "function") (arg as (b: unknown) => unknown)(builder);
        else if (typeof arg === "object" && arg) note(JSON.stringify(arg));
        return builder;
      },
      whereNot: () => builder,
      whereNull: (c: string) => { note(`${c} IS NULL`); return builder; },
      orWhere: (arg: unknown) => { note(JSON.stringify(arg)); return builder; },
      // The two guards that matter are raw, so this is where they land.
      whereRaw: (sql: string) => { note(sql); return builder; },
      update: (data: Record<string, unknown>) => { captured.updated = data; return builder; },
      returning: async () => [{ id: 1 }],
      then: (res: (v: unknown) => unknown) => res(1),
    });
    const fake = () => builder;
    Object.assign(fake, { fn: { now: () => "now()" }, raw: (sql: string) => sql });
    return { db: fake as never, captured };
  }

  const withEmail = fakeDb();
  await recordVolunteeredContact(withEmail.db, { visitorKey: "k", embedConfigId: 1, name: "John", email: "john@example.com" });
  const e = withEmail.captured.updated ?? {};
  assert(e.contact_status === "submitted", "a volunteered EMAIL settles the contact card for good", e);
  assert(!("summary_status" in e),
    "but arms NO summary — an address typed in passing is not a request for the transcript", e);
  assert(e.contact_source === "volunteered", "recorded as volunteered, not as the card", e);
  assert(!("status" in e), "never names the generated status column", e);

  const nameOnly = fakeDb();
  await recordVolunteeredContact(nameOnly.db, { visitorKey: "k", embedConfigId: 1, name: "John" });
  const n = nameOnly.captured.updated ?? {};
  assert(!("contact_status" in n), "a name ALONE does not settle the card — it still has an email to ask for", n);
  assert(!("summary_status" in n), "and arms no summary, because there is nowhere to send one", n);
  assert("name" in n, "but the name is stored, so the card can ask knowing who it is asking", n);

  // A typo must be correctable. The first volunteered address used to lock the row — the filter
  // skipped `submitted` rows AND the writes were COALESCE'd — so "sorry, it's .com not .cmo"
  // landed nowhere and the summary went to a stranger holding this visitor's conversation.
  const fix = fakeDb();
  await recordVolunteeredContact(fix.db, { visitorKey: "k", embedConfigId: 1, email: "john@gmail.com" });
  const f = fix.captured.updated ?? {};
  assert(f.email === "john@gmail.com", "a corrected address REPLACES the stored one, not COALESCE'd away", f);
  assert(String(f.contact_submitted_at).includes("COALESCE"),
    "but the timestamp keeps when we FIRST got details", f.contact_submitted_at);

  const sql = fix.captured.sql ?? "";
  assert(/contact_source IS DISTINCT FROM 'card'/i.test(sql),
    "a form-typed address is protected — the visitor's own keystrokes beat a model's reading", sql);
  assert(!/contact_status.*submitted/i.test(sql.replace(/set .*/is, "")),
    "and contact_status is no longer the guard: it means 'stop asking', not 'immutable'", sql);
  assert(/summary_status/i.test(sql),
    "an address a summary already went to is history and stays put", sql);

  // The consent path the volunteered address makes POSSIBLE but does not itself trigger: once an
  // email is held, the end-of-chat card can be offered, and accepting it is what arms the summary.
  const { decidePrompt, DEFAULT_CONTACT_ASK } = await import("../src/modules/ai-counsellor/services/visitor.service.js");
  const holder = {
    visitor_key: "k", contact_status: "submitted" as const, contact_prompted_at_count: null,
    contact_prompt_count: 0, email: "john@example.com", conversation_state: "active" as const,
    end_prompt_count: 0, summary_status: null,
  };
  assert(decidePrompt(holder, 6, true, DEFAULT_CONTACT_ASK) === "ending",
    "a visitor whose address we hold is OFFERED a summary at a natural ending");
  assert(decidePrompt(holder, 6, false, DEFAULT_CONTACT_ASK) === null,
    "and is offered nothing while the conversation is still going");
  assert(decidePrompt({ ...holder, summary_status: "sent" as const }, 6, true, DEFAULT_CONTACT_ASK) === null,
    "a summary already sent is never offered again");

  const meta = fakeDb();
  await recordMeta(meta.db, 1, { referrer: "https://uni.edu/courses" });
  assert(String((meta.captured.updated ?? {}).meta).includes("meta ||"),
    "meta is merged in SQL, not read-modify-written", meta.captured.updated);

  const empty = fakeDb();
  await recordMeta(empty.db, 1, {});
  assert(empty.captured.updated === undefined, "an empty patch issues no statement at all");

  const huge = fakeDb();
  await recordMeta(huge.db, 1, { blob: "x".repeat(5000) });
  assert(huge.captured.updated === undefined,
    "an oversized patch is dropped — this row is read on every single turn");
}

console.log(`\n${passed} passed, ${failed} failed`);
await db.destroy();
process.exit(failed === 0 ? 0 : 1);
