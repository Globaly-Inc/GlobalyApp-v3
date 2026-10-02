// Admin-sent onboarding invites — master `onboarding_invitations` (migration 20260930_002).

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

export interface OnboardingInvitationRow {
  id: string;
  email: string;
  type: "institution" | "business";
  org_name: string;
  contact_name: string | null;
  business_category_id: number | null;
  token_hash: string;
  /** Links from before a resend/sweep, each valid only until its own `exp`. */
  previous_tokens: { h: string; exp: string }[];
  invited_by: number | null;
  status: "pending" | "accepted" | "revoked";
  expires_at: Date;
  accepted_user_id: number | null;
  accepted_institution_id: number | null;
  accepted_business_id: number | null;
  accepted_at: Date | null;
  email_status: "queued" | "sent" | "failed";
  email_sent_at: Date | null;
  email_error: string | null;
  link_requested_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** A list filter: a stored status, or "expired" — pending past its `expires_at`, never stored. */
export type InvitationStatusFilter = OnboardingInvitationRow["status"] | "expired";

const T = "onboarding_invitations";

type Q = import("knex").Knex.QueryBuilder;

/** Any link this invite ever had, expired or not — only for recognising a link to an accepted invite. */
const matchesAnyToken = (tokenHash: string) => (q: Q) =>
  q.where("token_hash", tokenHash)
    .orWhereRaw("previous_tokens @> jsonb_build_array(jsonb_build_object('h', ?::text))", [tokenHash]);

/** A link still inside its OWN deadline: the current one before `expires_at`, or an earlier one before
 *  the expiry it was issued with. A resend extends only the new link — never an already-expired one. */
const matchesLiveToken = (tokenHash: string) => (q: Q) =>
  q.where((cur: Q) => cur.where("token_hash", tokenHash).where("expires_at", ">", masterKnex.fn.now()))
    .orWhereRaw(
      "exists (select 1 from jsonb_array_elements(previous_tokens) e where e->>'h' = ? and (e->>'exp')::timestamptz > now())",
      [tokenHash],
    );

/** New link; the one it replaces keeps working until its own expiry (its email may still be in flight
 *  or unread). An already-expired link isn't kept. SET sees the row's old values, so this reads the
 *  outgoing token_hash/expires_at. */
const rotateTo = (tokenHash: string, expiresAt: Date) => ({
  previous_tokens: masterKnex.raw(
    "CASE WHEN expires_at > now() THEN previous_tokens || jsonb_build_array(jsonb_build_object('h', token_hash, 'exp', expires_at)) ELSE previous_tokens END",
  ),
  token_hash: tokenHash,
  expires_at: expiresAt,
  updated_at: masterKnex.fn.now(),
});

const ABANDONED_JOB_STATUSES = ["declined", "failed"] as const;

/** Why this address can't be invited, or null. An invite is only for someone not on the platform yet. */
export type EmailMatch = { kind: "user" | "institution" | "business" | "extraction" | "invite"; id: string | number; name: string | null };

/** Every place the address is already in use; an invite is only sent when this is empty. */
export async function findEmailMatches(email: string): Promise<EmailMatch[]> {
  const sameEmail = (column: string) => [`lower(${column}) = lower(?)`, [email]] as const;
  const [users, institutions, businesses, extractions, invites] = await Promise.all([
    masterKnex("platform_users").whereRaw(...sameEmail("email")).whereNull("deleted_at")
      .select("id", masterKnex.raw("nullif(trim(concat_ws(' ', first_name, last_name)), '') as name")),
    masterKnex("institutions").whereRaw(...sameEmail("email")).whereNull("deleted_at").select("id", "institution_name as name"),
    masterKnex("businesses").whereRaw(...sameEmail("email")).whereNull("deleted_at").select("id", "business_name as name"),
    masterKnex("superadmin.extraction_institution_overview as o").join("superadmin.extraction_jobs as j", "j.id", "o.job_id")
      .whereRaw(...sameEmail("o.email")).whereNotIn("j.status", ABANDONED_JOB_STATUSES)
      .distinct("j.id", "j.institution_name as name"),
    masterKnex(T).whereRaw(...sameEmail("email")).where({ status: "pending" }).select("id", "org_name as name"),
  ]);
  const tag = (kind: EmailMatch["kind"], rows: { id: string | number; name: string | null }[]) =>
    rows.map((r): EmailMatch => ({ kind, id: r.id, name: r.name || null }));
  return [
    ...tag("user", users), ...tag("institution", institutions), ...tag("business", businesses),
    ...tag("extraction", extractions), ...tag("invite", invites),
  ];
}

export async function insertInvitation(data: {
  email: string;
  type: OnboardingInvitationRow["type"];
  org_name: string;
  contact_name: string | null;
  business_category_id: number | null;
  token_hash: string;
  invited_by: number | null;
  expires_at: Date;
}) {
  const [row] = await masterKnex<OnboardingInvitationRow>(T).insert(data).returning("*");
  return row;
}

const likeLiteral = (value: string) => value.replace(/[\\%_]/g, "\\$&");

const searchClause = (search?: string) => (q: Knex.QueryBuilder) => {
  if (!search) return;
  const pattern = `%${likeLiteral(search)}%`;
  q.where((b) =>
    b.whereRaw("oi.org_name ILIKE ? ESCAPE '\\'", [pattern])
      .orWhereRaw("oi.email ILIKE ? ESCAPE '\\'", [pattern]),
  );
};

/** Per effective status, honouring the search but not the status filter, so the filter cards stay put as one is picked. */
async function countByStatus(search?: string) {
  const [r] = await masterKnex(`${T} as oi`).modify(searchClause(search)).select(
    masterKnex.raw("count(*) filter (where oi.status = 'pending' and oi.expires_at > now())::int as pending"),
    masterKnex.raw("count(*) filter (where oi.status = 'pending' and oi.expires_at <= now())::int as expired"),
    masterKnex.raw("count(*) filter (where oi.status = 'accepted')::int as accepted"),
    masterKnex.raw("count(*) filter (where oi.status = 'revoked')::int as revoked"),
  );
  return r as { pending: number; expired: number; accepted: number; revoked: number };
}

export async function listInvitations(limit: number, offset: number, status?: InvitationStatusFilter, search?: string) {
  const base = masterKnex(`${T} as oi`).modify((q) => {
    searchClause(search)(q);
    if (status === "expired") q.where("oi.status", "pending").where("oi.expires_at", "<=", masterKnex.fn.now());
    else if (status === "pending") q.where("oi.status", "pending").where("oi.expires_at", ">", masterKnex.fn.now());
    else if (status) q.where("oi.status", status);
  });
  const [rows, [{ count }], counts] = await Promise.all([
    base.clone()
      .leftJoin("business_categories as c", "c.id", "oi.business_category_id")
      .leftJoin("platform_users as u", "u.id", "oi.invited_by")
      .select(masterKnex.raw("nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '') as invited_by_name"))
      .select("oi.id", "oi.email", "oi.org_name", "oi.type", "oi.status", "oi.expires_at", "oi.business_category_id",
        "c.name as business_category_name", "oi.accepted_institution_id", "oi.accepted_business_id",
        "oi.accepted_at", "oi.email_status", "oi.email_sent_at", "oi.email_error", "oi.link_requested_at", "oi.created_at")
      .orderBy("oi.created_at", "desc")
      .limit(limit)
      .offset(offset),
    base.clone().count("oi.id as count"),
    countByStatus(search),
  ]);
  return { rows, total: Number(count), counts };
}

export async function deleteInvitation(id: string): Promise<boolean> {
  return (await masterKnex(T).where({ id })
    .whereRaw("not (status = 'accepted' and accepted_user_id is null)")
    .delete()) > 0;
}

export async function findById(id: string) {
  return masterKnex<OnboardingInvitationRow>(T).where({ id }).first();
}

export async function findPendingById(id: string) {
  return masterKnex<OnboardingInvitationRow>(T).where({ id, status: "pending" }).first();
}

export async function refreshToken(
  id: string, tokenHash: string, expiresAt: Date, { onlyIfRequested = false } = {},
): Promise<boolean> {
  const count = await masterKnex(T).where({ id, status: "pending" })
    .modify((q) => { if (onlyIfRequested) q.whereNotNull("link_requested_at"); })
    .update({ ...rotateTo(tokenHash, expiresAt), email_status: "queued", email_error: null, link_requested_at: null });
  return count > 0;
}

const LINK_REQUEST_EVERY = "24 hours";

/** Records the invitee's "request a new link" at most once a day, so the button can't flood the
 *  admin's inbox. True when this call is the one that should notify. */
export async function markLinkRequested(id: string): Promise<boolean> {
  const count = await masterKnex(T).where({ id })
    .where((q) => q.whereNull("link_requested_at").orWhereRaw(`link_requested_at < now() - interval '${LINK_REQUEST_EVERY}'`))
    .update({ link_requested_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function clearLinkRequest(id: string) {
  await masterKnex(T).where({ id }).update({ link_requested_at: null, updated_at: masterKnex.fn.now() });
}

export async function findInviterEmail(invitedBy: number | null): Promise<string | null> {
  if (!invitedBy) return null;
  const row = await masterKnex("platform_users").where({ id: invitedBy }).whereNull("deleted_at").first("email");
  return row?.email ?? null;
}

/** A fresh invite answers any open request from that address's revoked ones. */
export async function clearLinkRequestsForEmail(email: string) {
  await masterKnex(T).whereRaw("lower(email) = lower(?)", [email]).whereNotNull("link_requested_at")
    .update({ link_requested_at: null, updated_at: masterKnex.fn.now() });
}

export async function markEmailSent(id: string) {
  await masterKnex(T).where({ id })
    .update({ email_status: "sent", email_sent_at: masterKnex.fn.now(), email_error: null, updated_at: masterKnex.fn.now() });
}

export async function markEmailFailed(id: string, error: string) {
  await masterKnex(T).where({ id })
    .update({ email_status: "failed", email_error: error.slice(0, 500), updated_at: masterKnex.fn.now() });
}

/** Moves an invite only if it is still in `from` — revoke and accept race on the same row, so the
 *  loser must see that it lost instead of overwriting the winner. */
export async function transitionStatus(
  id: string, from: OnboardingInvitationRow["status"], to: OnboardingInvitationRow["status"],
): Promise<boolean> {
  const count = await masterKnex(T).where({ id, status: from }).update({ status: to, updated_at: masterKnex.fn.now() });
  return count > 0;
}

/** Atomically takes a live invite, so two clicks can't both create an institution. */
export async function claimPending(tokenHash: string, type: OnboardingInvitationRow["type"]) {
  const [row] = await masterKnex<OnboardingInvitationRow>(T)
    .where({ type, status: "pending" })
    .where(matchesLiveToken(tokenHash))
    .update({ status: "accepted", accepted_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() })
    .returning("*");
  return row as OnboardingInvitationRow | undefined;
}

export async function findByTokenHash(tokenHash: string) {
  return masterKnex<OnboardingInvitationRow>(T).where(matchesAnyToken(tokenHash)).first();
}

export async function isLiveToken(tokenHash: string): Promise<boolean> {
  return Boolean(await masterKnex(T).where(matchesLiveToken(tokenHash)).first("id"));
}

/** Releases a claim whose setup failed. Only from "accepted": a revoke that landed meanwhile stays. */
export async function revertToPending(id: string) {
  await masterKnex(T).where({ id, status: "accepted" })
    .update({ status: "pending", accepted_at: null, updated_at: masterKnex.fn.now() });
}

export async function recordAccepted(
  id: string, userId: number, org: { institutionId?: number; businessId?: number },
): Promise<boolean> {
  const count = await masterKnex(T).where({ id }).update({
    accepted_user_id: userId,
    accepted_institution_id: org.institutionId ?? null,
    accepted_business_id: org.businessId ?? null,
    updated_at: masterKnex.fn.now(),
  });
  return count > 0;
}

export async function findCategory(id: number): Promise<{ id: number; slug: string; name: string } | undefined> {
  return masterKnex("business_categories").where({ id }).first("id", "slug", "name");
}

export async function findInstitutionByOwner(platformUserId: number) {
  return masterKnex("institutions").where({ platform_user_id: platformUserId }).first("id", "source_job_id", "schema_name");
}

export async function findBusinessByOwner(platformUserId: number) {
  return masterKnex("businesses").where({ owner_id: platformUserId }).first("id", "schema_name");
}
