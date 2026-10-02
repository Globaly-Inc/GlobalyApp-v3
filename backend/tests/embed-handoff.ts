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

console.log("\n5. the Developer role is minted against the real permissions key");
{
  // Regression: this lookup was written as where "name" in (...). `permissions` has no such
  // column — it is keyed by (module, action) — so every invite 500'd on the first org that had
  // no Developer role yet, which is every org.
  reset([
    [/from "roles"/i, () => []],
    [/from "permissions"/i, () => [{ id: 5 }]],
    [/insert into "roles"/i, () => [{ id: 9, name: "developer", display_name: "Developer", is_system: false }]],
    [/insert into "role_permissions"/i, () => []],
    [/from "role_permissions"/i, () => [{ permission_id: 5 }]],
    [/from "agents"/i, () => [{ count: "0" }]],
  ]);
  await handoff.ensureDeveloperRole(masterKnex, "business");

  const perms = find(/select "id" from "permissions"/i);
  assert(!!perms, "the permissions lookup ran");
  assert(!/"name"/.test(perms.text), "it does NOT filter on a name column", perms.text);
  assert(/"module"/.test(perms.text) && /"action"/.test(perms.text), "it filters on (module, action)", perms.text);
  assert(perms.values.includes("business") && perms.values.includes("read"), "asking for business:read", perms.values);

  const role = find(/insert into "roles"/i);
  assert(role.values.includes("developer"), "role slug is `developer`, matching members.role and the invite", role.values);
}

console.log("\n5b. a tenant that already has the role is left alone");
{
  reset([[/from "roles"/i, () => [{ id: 3, name: "developer" }]]]);
  await handoff.ensureDeveloperRole(masterKnex, "institution");
  assert(count(/insert into "roles"/i) === 0, "no second Developer role is created");
  assert(count(/from "permissions"/i) === 0, "and no permissions are touched");
}

console.log("\n5c. a Developer role the tenant once deleted is revived, not duplicated");
{
  // `roles.name` is UNIQUE and deleteRole only sets deleted_at, so the row survives. Inserting a
  // second violates the constraint; returning early leaves createInvitation's findRoleByName —
  // which filters deleted_at — to throw `Role "developer" not found` at the owner.
  reset([[/from "roles"/i, () => [{ id: 4, deleted_at: new Date() }]]]);
  await handoff.ensureDeveloperRole(masterKnex, "business");
  assert(count(/insert into "roles"/i) === 0, "no second row — roles.name is UNIQUE");
  const undelete = find(/update "roles"/i);
  assert(!!undelete && undelete.values.includes(4), "the existing row is undeleted instead", undelete?.text);
}

console.log("\n7. a withdrawn or lapsed invitation is not the developer");
{
  reset([[/from "agents"/i, () => []], [/from "agent_invitations"/i, () => []]]);
  await handoff.findDeveloper(masterKnex, "business");
  const invite = find(/from "agent_invitations"/i);
  assert(/"deleted_at" is null/i.test(invite.text),
    "revoked invites are excluded, or the card keeps mailing someone the org removed", invite.text);
  assert(/"expired_at" >/i.test(invite.text),
    "lapsed invites are excluded, so the card offers to invite a replacement", invite.text);
}

console.log("\n8. only an invite needs team rights");
{
  const { invitesSomeone } = await import("../src/modules/ai-counsellor/routes/embed.routes.js");
  assert(invitesSomeone({ invitee: { name: "Sam Taylor", email: "sam@acme.edu" } }) === true,
    "a request carrying an invitee is gated");
  assert(invitesSomeone({}) === false, "mailing the existing developer is not");
  assert(invitesSomeone(undefined) === false, "a missing body is not an invite");
  assert(invitesSomeone({ invitee: { name: "", email: "nope" } }) === false,
    "invalid input is left to the handler's 400 rather than answered with a 403");
}

console.log("\n9. an invitee already on the team is mailed the code, never invited twice");
{
  // Regression: the invite path refuses an existing teammate outright ("User is already an agent in
  // this business"), so typing a colleague's address used to fail the whole send.
  reset([
    [/from "agents" as "a"/i, () => []],
    [/from "agent_invitations"/i, () => []],
    [/from "platform_users"/i, () => [{ id: 42, email: "sam@acme.edu", first_name: "Sam", last_name: "Taylor" }]],
    [/from "agents"/i, () => [{ id: 7, platform_user_id: 42, is_contact_only: false, account_status: 1, first_name: "Sam", last_name: "Taylor" }]],
  ]);
  const result = await handoff.sendSnippetToDeveloper({
    db: masterKnex, owner: { kind: "business", id: 7 }, orgSchemaName: "s", orgName: "Acme",
    embedKey: "abc-123", inviterPlatformUserId: 1, invitee: { name: "Sam Taylor", email: "sam@acme.edu" },
  });
  assert(result.sent_to === "sam@acme.edu", "the code goes to them", result);
  assert(result.invited === false, "and nobody was invited", result);
  assert(count(/insert into "agent_invitations"/i) === 0, "no invitation row was written");
  assert(count(/insert into "roles"/i) === 0, "and the Developer role was not minted for a team that gains nobody");
}

console.log("\n9a. a suspended teammate is refused, not mailed a sign-in promise");
{
  reset([
    [/from "agents" as "a"/i, () => []],
    [/from "agent_invitations"/i, () => []],
    [/from "platform_users"/i, () => [{ id: 42, email: "sam@acme.edu", first_name: "Sam", last_name: "Taylor" }]],
    [/from "agents"/i, () => [{ id: 7, platform_user_id: 42, is_contact_only: false, account_status: 0, first_name: "Sam", last_name: "Taylor" }]],
  ]);
  let refused = false;
  try {
    await handoff.sendSnippetToDeveloper({
      db: masterKnex, owner: { kind: "business", id: 7 }, orgSchemaName: "s", orgName: "Acme",
      embedKey: "abc-123", inviterPlatformUserId: 1, invitee: { name: "Sam Taylor", email: "sam@acme.edu" },
    });
  } catch { refused = true; }
  assert(refused, "suspended access throws instead of sending");
}

console.log("\n9b. the mail says how each reader reaches the portal");
{
  const { embedSnippetEmail } = await import("../src/shared/mail/templates.js");
  const mail = (access: "invited" | "pending" | "member") =>
    embedSnippetEmail({ recipientName: "Sam", orgName: "Acme", snippet: "<script></script>", widgetUrl: "u", access });
  assert(mail("invited").text.includes("A separate email has your sign-in link"),
    "someone invited by this very action is told the second email is coming");
  assert(mail("pending").text.includes("invitation to join Acme on GlobalyApp is still open"),
    "someone who never accepted is pointed at that invitation, not at a login they do not have");
  assert(mail("member").text.includes("already on Acme's GlobalyApp team"),
    "an existing teammate is told they can just sign in");
  assert(!mail("member").text.includes("sign-in link") && !mail("member").text.includes("still open"),
    "and is promised no invitation, because none was sent", mail("member").text.slice(-300));
}

console.log("\n6. send-snippet input");
{
  assert(SendSnippetSchema.safeParse({}).success, "no invitee — the team already has a developer");
  assert(SendSnippetSchema.safeParse({ invitee: { name: "Sam Taylor", email: "SAM@Acme.edu" } }).success, "name + email accepted");
  assert(SendSnippetSchema.parse({ invitee: { name: " Sam ", email: "SAM@Acme.edu" } }).invitee?.email === "sam@acme.edu",
    "email is trimmed and lower-cased before it reaches the invite");
  assert(!SendSnippetSchema.safeParse({ invitee: { name: "Sam", email: "not-an-email" } }).success, "a bad address is refused");
  assert(!SendSnippetSchema.safeParse({ invitee: { name: "", email: "sam@acme.edu" } }).success,
    "a blank name is refused — InviteAgentSchema needs a real last_name and the mail opens 'Hi {first}'");
}

finish();
