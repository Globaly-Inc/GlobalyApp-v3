/**
 * Portal AI-embed card: the widget is minted once and scoped to its owner, and the snippet the
 * email carries is the same tag the portal shows.
 *
 * Run: node --import tsx tests/embed-handoff.ts   (npm run test:embed-handoff)
 * Fake wire: tests/institution-memory.harness.ts. No DB needed.
 */
export {};

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.WEB_APP_URL = "https://app.globalyapp.com/";

const h = await import("./institution-memory.harness.js");
const { assert, finish, reset, find, count } = h;
const { masterKnex } = await import("../src/core/db/master-pool.js");
const repo = await import("../src/modules/ai-counsellor/repositories/embed.repository.js");
const handoff = await import("../src/modules/ai-counsellor/services/embed-handoff.service.js");
const { embedSnippet } = handoff;
const { SendSnippetSchema } = await import("../src/modules/ai-counsellor/schemas/chat.schema.js");

const SEL = /^select .* from "ai_embed_configs"/i;
const INS = /^insert into "ai_embed_configs"/i;

console.log("\n1. an org that already has an active widget keeps it — nothing is minted");
{
  reset([[SEL, () => [{ id: 9, embed_key: "k", is_active: true }]]]);
  const config = await repo.ensureForOwner({ kind: "institution", id: 49 });
  assert(config.id === 9, "returned the existing widget", config);
  assert(count(INS) === 0, "no INSERT was issued");
  const s = find(SEL);
  assert(/"institution_id" = \$\d/.test(s.text) && s.values.includes(49), "lookup scoped to the institution", s.text);
  assert(/"is_active"/.test(s.text), "only an ACTIVE widget counts — a paused key would 403 for the developer", s.text);
  assert(/order by "created_at" asc, "id" asc/i.test(s.text),
    "OLDEST active, so the card follows the key a customer may already have pasted into their site", s.text);
}

console.log("\n2. an org with none gets one, owned by them and nobody else");
{
  reset([[SEL, () => []], [INS, () => [{ id: 11, embed_key: "fresh" }]]]);
  const config = await repo.ensureForOwner({ kind: "business", id: 7 });
  assert(config.id === 11, "returned the new widget", config);
  const lock = find(/pg_advisory_xact_lock/i);
  assert(!!lock && lock.values.includes("embed_mint:business:7"),
    "the mint is serialized per owner, so two first visits can't each create a widget", lock?.values);
  const s = find(INS);
  assert(/"business_id"/.test(s.text) && s.values.includes(7), "INSERT carries the business id", s.text);
  assert(!/"institution_id"/.test(s.text), "and not the other owner column — the CHECK allows exactly one", s.text);
}

console.log("\n3. the minted widget is bare, so the onboarding checklist stays honest");
{
  reset([[SEL, () => []], [INS, () => [{ id: 12 }]]]);
  await repo.ensureForOwner({ kind: "business", id: 7 });
  const s = find(INS);
  assert(!/"display_name"|"greeting"/.test(s.text),
    "no display_name or greeting — those are what 'Customise your AI assistant' reads", s.text);
}

console.log("\n4. the snippet the email carries");
{
  const tag = embedSnippet("abc-123");
  // Must stay identical to frontend .../ai-widget/components/widget-card.tsx embedSnippet.
  assert(tag === `<script src="https://app.globalyapp.com/embed.js" data-key="abc-123" async></script>`,
    "exact tag, with the trailing slash trimmed off WEB_APP_URL", tag);
}

console.log("\n5. a send records the recipient and mails them — no team row anywhere");
{
  // The whole point of 20261005_001: the people who paste a script tag are agencies and
  // contractors. Touching agents/members/roles/invitations here is the defect, not a detail.
  reset([[/insert into "ai_embed_developers"/i, () => [{ id: 1, ai_embed_config_id: 5, email: "dev@agency.com", last_sent_at: new Date(), send_count: 1 }]],
         [/from "ai_embed_developers"/i, () => [{ id: 1, ai_embed_config_id: 5, email: "dev@agency.com", last_sent_at: new Date(), send_count: 1 }]]]);
  const result = await handoff.sendSnippet({
    db: masterKnex, configId: 5, embedKey: "abc-123", orgName: "Acme", emails: ["dev@agency.com"],
  });
  assert(result.sent_to === "dev@agency.com", "the code goes to the typed address", result);
  assert(result.recipients.length === 1 && result.recipients[0].email === "dev@agency.com",
    "and the send comes back with the list it just changed", result.recipients);
  for (const table of [/from "agents"/i, /from "members"/i, /from "platform_users"/i, /from "roles"/i,
                       /insert into "roles"/i, /insert into "agent_invitations"/i, /insert into "member_invitations"/i]) {
    assert(count(table) === 0, `no team table touched: ${table}`);
  }
}

console.log("\n5a. a repeat send updates that row instead of adding a second");
{
  reset([[/insert into "ai_embed_developers"/i, () => [{ id: 1, send_count: 2 }]], [/from "ai_embed_developers"/i, () => []]]);
  await handoff.sendSnippet({ db: masterKnex, configId: 5, embedKey: "k", orgName: "Acme", emails: ["dev@agency.com", "dev@agency.com"] });
  assert(count(/insert into "ai_embed_developers"/i) === 1, "the duplicate address is mailed and recorded once");
  const ins = find(/insert into "ai_embed_developers"/i);
  assert(/on conflict \("ai_embed_config_id", "email"\)/i.test(ins.text),
    "the insert upserts on (config, email) — two sends must not leave two rows", ins.text);
  assert(/send_count \+ 1/i.test(ins.text), "and bumps the count rather than resetting it", ins.text);
}

console.log("\n5b. the recipient list is scoped to the widget, on the caller's own connection");
{
  reset([[/from "ai_embed_developers"/i, () => []]]);
  await handoff.listRecipients(masterKnex, 5);
  const sel = find(/from "ai_embed_developers"/i);
  assert(/"ai_embed_config_id" = \$\d/.test(sel.text) && sel.values.includes(5),
    "scoped to this widget's config, never the whole table", sel.text);
  // The rows live in the TENANT schema (20261005_001, business/ + institution/), so the caller's
  // connection IS the org boundary — there is no owner column here to forget in a WHERE clause.
  assert(!/business_id|institution_id/.test(sel.text),
    "and carries no owner column — isolation is the connection, as with ai_widget_visitors", sel.text);
}

console.log("\n5c. forgetting a recipient is scoped too");
{
  reset([[/delete from "ai_embed_developers"/i, () => 1]]);
  await handoff.forgetRecipient(masterKnex, 5, 9);
  const del = find(/delete from "ai_embed_developers"/i);
  assert(del.values.includes(5) && del.values.includes(9),
    "the delete carries the config id as well as the row id, so one org cannot delete another's", del.values);
}

console.log("\n6. the mail promises no account, because the reader has none");
{
  const { embedSnippetEmail } = await import("../src/shared/mail/templates.js");
  const mail = embedSnippetEmail({ orgName: "Acme", snippet: "<script></script>" });
  assert(mail.text.includes("<script></script>"), "the code is the payload");
  assert(!/sign in|sign-in|invitation|your team|Developer/i.test(mail.text),
    "no invitation, no team, no role — this reader is not staff", mail.text.slice(-400));
  assert(!/Open widget settings/i.test(mail.html),
    "and no portal link, which would only land them on a login they cannot pass");
  assert(mail.text.startsWith("Hi there,"), "addressed generically — we store no name for them");
}

console.log("\n7. send-snippet input");
{
  const ten = Array.from({ length: 10 }, (_, i) => `d${i}@agency.com`);
  assert(SendSnippetSchema.safeParse({ emails: ten }).success, "ten addresses are accepted");
  assert(!SendSnippetSchema.safeParse({ emails: [...ten, "one@too.many"] }).success,
    "eleven is refused — this endpoint mails arbitrary addresses");
  assert(!SendSnippetSchema.safeParse({ emails: [] }).success, "an empty list is refused rather than silently sending nothing");
  assert(!SendSnippetSchema.safeParse({ emails: ["not-an-email"] }).success, "a bad address is refused");
  assert(!SendSnippetSchema.safeParse({}).success, "and the list is required — there is no other way to address this now");
  assert(SendSnippetSchema.parse({ emails: [" DEV@Agency.com "] }).emails[0] === "dev@agency.com",
    "addresses are trimmed and lower-cased, so the unique index actually dedupes");
  assert(!SendSnippetSchema.safeParse({ emails: ["a@b.com"], invitee: { name: "Sam", email: "s@b.com" } }).success,
    "the old invitee form is refused outright — nobody is invited by sending a code");
}

finish();
