// Handing the embed snippet to whoever actually pastes it: the org's developer.
//
// The owner rarely installs the widget themselves, so the portal card mails the one-line tag to a
// team member holding the `developer` role. No tenant ships with that role — it is minted on first
// use (user decision 2026-10-02: per-tenant on demand, not seeded for everyone), and the person is
// invited for real, so they can sign in and reach the widget page they are being asked to install.

import type { Knex } from "knex";
import { config } from "../../../config.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { queueEmail } from "../../auth/auth.service.js";
import { embedSnippetEmail } from "../../../shared/mail/templates.js";
import * as agentsService from "../../agents/services/agents.service.js";
import * as agentsRepo from "../../agents/repositories/agents.repository.js";
import * as institutionMembers from "../../platform-users/services/institution-members.service.js";
import * as institutionInvitesRepo from "../../platform-users/repositories/institution-invitations.repository.js";
import * as platformUserRepo from "../../platform-users/repositories/platform-users.repository.js";
import type { EmbedOwner } from "../repositories/embed.repository.js";

const logger = createChildLogger("embed-handoff");

/** What slugifyRoleName("Developer") produces — the value stored in both org kinds. */
const DEVELOPER_ROLE = "developer";
const DEVELOPER_ROLE_DISPLAY = "Developer";
/**
 * Enough to enter the portal and reach the widget page; deliberately not enquiry access.
 *
 * `permissions` is keyed by (module, action) — there is no `name` column, and "business:read" is
 * only how the pair is spelled in prose. Both tenant kinds seed this pair.
 */
const DEVELOPER_PERMISSIONS: ReadonlyArray<[module: string, action: string]> = [["business", "read"]];

/**
 * The one-line tag the customer pastes.
 *
 * Built here as well as in the portal (`frontend/src/app/business/ai-widget/components/widget-card.tsx`
 * `embedSnippet`), because an email has no browser origin to read. The two must stay identical —
 * change one, change the other.
 */
export function embedSnippet(embedKey: string): string {
  return `<script src="${config.WEB_APP_URL.replace(/\/$/, "")}/embed.js" data-key="${embedKey}" async></script>`;
}

export interface DeveloperContact {
  email: string;
  name: string | null;
  /** Invited but has not accepted yet — they can still receive the snippet. */
  pending: boolean;
}

const fullName = (first?: string | null, last?: string | null) =>
  [first, last].filter(Boolean).join(" ").trim() || null;

/** `platform_users.email` is authoritative; the tenant row's copy is a snapshot that can go stale
 *  (enrichAgents / enrichMembers resolve it the same way). */
async function authoritativeEmail(platformUserId: number | null, fallback: string | null): Promise<string | null> {
  if (!platformUserId) return fallback;
  const user = await masterKnex("platform_users").where({ id: platformUserId }).whereNull("deleted_at").first("email");
  return user?.email ?? fallback;
}

async function findAcceptedDeveloper(db: Knex, kind: EmbedOwner["kind"]): Promise<DeveloperContact | null> {
  const row = kind === "institution"
    ? await db("members").where({ role: DEVELOPER_ROLE }).whereNull("deleted_at")
        .first("platform_user_id", "email", "first_name", "last_name")
    : await db("agents as a").join("roles as r", "r.id", "a.role_id")
        .where("r.name", DEVELOPER_ROLE).whereNull("a.deleted_at")
        .first("a.platform_user_id", "a.email", "a.first_name", "a.last_name");
  if (!row) return null;
  const email = await authoritativeEmail(row.platform_user_id, row.email);
  return email ? { email, name: fullName(row.first_name, row.last_name), pending: false } : null;
}

async function findInvitedDeveloper(db: Knex, kind: EmbedOwner["kind"]): Promise<DeveloperContact | null> {
  const table = kind === "institution" ? "member_invitations" : "agent_invitations";
  const row = await db(table).where({ status: "pending" }).whereNull("deleted_at")
    .where("expired_at", ">", db.fn.now())
    .whereRaw("user_details->>'role' = ?", [DEVELOPER_ROLE])
    .orderBy("created_at", "desc")
    .first("email", "user_details");
  if (!row) return null;
  const details = row.user_details ?? {};
  return { email: row.email, name: fullName(details.first_name, details.last_name), pending: true };
}

/** Whoever the snippet should go to today, accepted member first. Null when nobody holds the role. */
export async function findDeveloper(db: Knex, kind: EmbedOwner["kind"]): Promise<DeveloperContact | null> {
  return (await findAcceptedDeveloper(db, kind)) ?? (await findInvitedDeveloper(db, kind));
}

/** Already on the team under some other role. Mirrors the check that would otherwise refuse the
 *  invite outright ("User is already an agent in this business"), so the card mails them the code
 *  instead of failing. A dormant "Add Contact" row is not on the team yet — inviting one is how
 *  they join — so it is left for the invite path to promote. */
async function findTeamMemberByEmail(
  db: Knex, kind: EmbedOwner["kind"], email: string,
): Promise<DeveloperContact | null> {
  const user = await platformUserRepo.findByEmail(email);
  if (!user) return null;
  const member = kind === "institution"
    ? await institutionInvitesRepo.findMemberByPlatformUserId(db, user.id)
    : await agentsRepo.findAgentByPlatformUserId(db, user.id);
  if (!member || member.is_contact_only) return null;
  return {
    email: user.email,
    name: fullName(member.first_name, member.last_name) ?? fullName(user.first_name, user.last_name),
    pending: false,
  };
}

/** The business invite path rejects a role the tenant does not have, so the role must exist before
 *  the invite. Idempotent: a tenant that already has one (however it was created) keeps it.
 *
 *  The soft-deleted case has to be revived rather than skipped or re-created. `roles.name` is
 *  UNIQUE and `deleteRole` only sets `deleted_at`, so a tenant that once deleted this role still
 *  holds the row: inserting a second would violate the constraint, and returning early would leave
 *  the invite to fail on `findRoleByName`, which filters `deleted_at`.
 *
 *  Exported for `tests/embed-handoff.ts`, which pins the permissions lookup to (module, action):
 *  it was written against a `name` column that does not exist, and only blew up at runtime. */
export async function ensureDeveloperRole(db: Knex, kind: EmbedOwner["kind"]): Promise<void> {
  const existing = await db("roles").where({ name: DEVELOPER_ROLE }).first("id", "deleted_at");
  if (existing) {
    if (existing.deleted_at) await db("roles").where({ id: existing.id }).update({ deleted_at: null });
    return;
  }
  const permissionIds = await db("permissions")
    .whereNull("deleted_at")
    .whereIn(["module", "action"], DEVELOPER_PERMISSIONS.map(([m, a]) => [m, a]))
    .pluck("id");
  await agentsService.createRole(db, kind === "institution" ? "institution" : "business", {
    display_name: DEVELOPER_ROLE_DISPLAY,
    description: "Installs and maintains the website chat widget.",
    permission_ids: permissionIds as number[],
  });
  logger.info("Developer role created for tenant", { kind, permissions: permissionIds.length });
}

/** "Sam Taylor" → first/last. A single-word name keeps the last name empty rather than inventing one. */
function splitName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/);
  return { first_name: parts[0] ?? "", last_name: parts.slice(1).join(" ") };
}

export interface SendSnippetResult {
  sent_to: string;
  /** True when this call also added them to the team — the UI says so explicitly. */
  invited: boolean;
}

/**
 * Mail the snippet to the org's developer, inviting one first when the team has none.
 *
 * `invitee` is needed only in that second case; it is ignored when a developer already exists,
 * rather than quietly adding a second one.
 */
export async function sendSnippetToDeveloper(args: {
  db: Knex;
  owner: EmbedOwner;
  orgSchemaName: string;
  orgName: string;
  embedKey: string;
  inviterPlatformUserId: number;
  invitee?: { name: string; email: string };
}): Promise<SendSnippetResult> {
  const { db, owner, orgSchemaName, orgName, embedKey, inviterPlatformUserId, invitee } = args;

  let developer = await findDeveloper(db, owner.kind);
  let invited = false;

  if (!developer) {
    if (!invitee) {
      throw new BadRequestError("Nobody on your team has the Developer role yet — send a name and email to invite one.");
    }
    // They may already be on the team under another role. Mail them the code rather than inviting
    // them again: the invite path refuses an existing teammate outright, which would leave the
    // owner unable to send the snippet to their own colleague. Their role is left alone — changing
    // it here could silently strip permissions they hold for everything else.
    developer = await findTeamMemberByEmail(db, owner.kind, invitee.email);
    if (!developer) {
      await ensureDeveloperRole(db, owner.kind);
      const { first_name, last_name } = splitName(invitee.name);
      const input = { first_name, last_name, email: invitee.email, role: DEVELOPER_ROLE };
      if (owner.kind === "institution") {
        await institutionMembers.inviteMemberAsAdmin(db, owner.id, orgSchemaName, input);
      } else {
        // Never the admin point of contact: this person installs a tag, they don't field enquiries.
        await agentsService.inviteAgent(db, { ...input, admin_point_of_contact: false }, inviterPlatformUserId, orgSchemaName);
      }
      developer = { email: invitee.email, name: fullName(first_name, last_name), pending: true };
      invited = true;
    }
  }

  // The invite, when there was one, is its own email and carries the sign-in link; this one carries
  // the snippet. Fire-and-forget like every other queued mail — the team change already happened and
  // must not be rolled back by a mail outage.
  const recipient = developer;
  queueEmail({
    to: recipient.email,
    ...embedSnippetEmail({
      recipientName: recipient.name,
      orgName,
      snippet: embedSnippet(embedKey),
      widgetUrl: `${config.WEB_APP_URL.replace(/\/$/, "")}/business/ai-widget`,
      access: invited ? "invited" : recipient.pending ? "pending" : "member",
    }),
  }).catch((err) => logger.warn("Embed snippet email failed", { to: recipient.email, err: err.message }));

  logger.info("Embed snippet sent to developer", { kind: owner.kind, id: owner.id, invited });
  return { sent_to: recipient.email, invited };
}
