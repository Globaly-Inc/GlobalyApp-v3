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
  assert(JSON.stringify(result.sent) === JSON.stringify(["dev@agency.com"]), "the code goes to the typed address", result);
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

console.log("\n8. mailing the org's code takes more than a seat in the org");
{
  const routes = await import("../src/modules/ai-counsellor/routes/embed.routes.js");
  const { requireWidgetAdmin } = routes;

  // Record what each route registers, without booting Fastify or a DB.
  const registered = new Map<string, unknown[]>();
  const capture = (method: string) => (url: string, opts: any) => {
    const pre = opts?.preHandler;
    registered.set(`${method} ${url}`, Array.isArray(pre) ? pre : [pre]);
  };
  await routes.embedRoutes({
    post: capture("POST"), get: capture("GET"),
    patch: capture("PATCH"), delete: capture("DELETE"),
  } as never);

  for (const route of ["POST /embed/send-snippet", "DELETE /embed/developers/:id"]) {
    assert(registered.get(route)?.includes(requireWidgetAdmin) === true,
      `${route} is gated — org context alone would let any member mail as the org`, registered.get(route));
  }
  // The card itself must stay open, or the portal home 403s for everyone but an admin.
  assert(registered.get("POST /embed/ensure")?.includes(requireWidgetAdmin) === false,
    "reading/minting the widget is NOT gated — that is the portal card loading");

  // Which guard runs is decided by orgType. No db on the fake request, so each underlying
  // guard bails with its own message instead of querying — enough to tell them apart.
  const answer = async (orgType?: string) => {
    let body: any;
    const reply = { status: () => reply, send: (b: unknown) => { body = b; } };
    await requireWidgetAdmin({ auth: { orgId: "acme", sub: "1", orgType } } as never, reply as never);
    return body?.error as string;
  };
  assert((await answer("institution")) === "Institution context required",
    "an institution token is checked against members, not the business agents table");
  assert((await answer()) === "Business context required",
    "and a business token (orgType absent on older tokens) against agents");
}

console.log("\n9. mail that never left is not reported as sent");
{
  const { queueService } = await import("../src/shared/queue/queueService.js");
  const { mailerService } = await import("../src/shared/mail/mailerService.js");
  const realPublish = queueService.publish;
  const realSend = mailerService.sendMail;

  // queueEmail only rejects when BOTH legs refuse, so take the broker down and fail the direct
  // send for chosen addresses. That is exactly the state the finding is about.
  const down = new Set<string>();
  queueService.publish = (async () => { throw new Error("broker down"); }) as never;
  mailerService.sendMail = (async (o: { to: string }) => {
    if (down.has(o.to)) throw new Error("smtp refused");
  }) as never;

  const INSERT_DEV = /insert into "ai_embed_developers"/i;
  const stubRows = () => reset([[INSERT_DEV, () => [{ id: 1, send_count: 1 }]], [/from "ai_embed_developers"/i, () => []]]);
  const both = ["ok@agency.com", "bad@agency.com"];

  down.add("bad@agency.com");
  stubRows();
  const partial = await handoff.sendSnippet({ db: masterKnex, configId: 5, embedKey: "k", orgName: "Acme", emails: both });
  assert(JSON.stringify(partial.sent) === JSON.stringify(["ok@agency.com"]),
    "only the accepted address is reported sent — the card merges exactly these rows", partial.sent);
  assert(JSON.stringify(partial.failed) === JSON.stringify(["bad@agency.com"]),
    "and the one that failed is named rather than silently logged", partial.failed);
  assert(count(INSERT_DEV) === 1,
    "no row recorded for mail that never left, so last_sent_at cannot claim a send that did not happen");

  down.add("ok@agency.com");
  stubRows();
  let threw = false;
  try {
    await handoff.sendSnippet({ db: masterKnex, configId: 5, embedKey: "k", orgName: "Acme", emails: both });
  } catch { threw = true; }
  assert(threw, "nothing sent is an error, not a 200 the dialog turns into 'we emailed the code'");
  assert(count(INSERT_DEV) === 0, "and nothing at all is recorded");

  // A delivered mail whose bookkeeping failed is still delivered. Reporting it as failed would
  // send the owner back to re-mail somebody who already has the code.
  down.clear();
  reset([
    [INSERT_DEV, () => { throw new Error("write failed"); }],
    [/from "ai_embed_developers"/i, () => []],
  ]);
  // Caught, not awaited bare: without the guard this throws 502 and the run dies before the
  // summary — the failure we want to SEE is "the owner is told it failed", not a crashed suite.
  let unrecorded: handoff.SendSnippetResult | null = null;
  try {
    unrecorded = await handoff.sendSnippet({ db: masterKnex, configId: 5, embedKey: "k", orgName: "Acme", emails: both });
  } catch (err) {
    assert(false, "a delivered mail whose row failed must not be reported as an error", String(err));
  }
  assert(unrecorded?.failed.length === 0,
    "a failed row does not make a delivered address 'failed'", unrecorded?.failed);
  assert(JSON.stringify(unrecorded?.sent) === JSON.stringify(both), "both are reported sent, because both were", unrecorded?.sent);

  // And one address failing never cancels or re-sends the others.
  down.add("bad@agency.com");
  stubRows();
  const independent = await handoff.sendSnippet({ db: masterKnex, configId: 5, embedKey: "k", orgName: "Acme", emails: both });
  assert(JSON.stringify(independent.sent) === JSON.stringify(["ok@agency.com"]) && independent.failed.length === 1,
    "addresses are independent — the good one is sent once and stays sent", independent);
  assert(count(INSERT_DEV) === 1, "and exactly one row is written, for the one that got there");

  queueService.publish = realPublish;
  mailerService.sendMail = realSend;
}

finish();
