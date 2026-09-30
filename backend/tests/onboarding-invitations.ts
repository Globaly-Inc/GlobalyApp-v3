/**
 * Onboarding invites — send checks, the email sent in the request, and accept creating
 * personal account + institution or business (and deliberately no session).
 *
 * Run: npm run test:onboarding-invitations   (needs migration 20260930_002 applied)
 *
 * WRITES to the dev DB (users, institutions, a tenant schema) and removes everything it created.
 */

import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { masterKnex } from "../src/core/db/master-pool.js";
import * as repo from "../src/modules/platform-users/repositories/onboarding-invitations.repository.js";
import {
  acceptInvitation, deleteInvitation, requestNewLink, resendInvitation, revokeInvitation, sendInvitation, withTimeout,
} from "../src/modules/platform-users/services/onboarding-invitations.service.js";
import { writeInstitutionOverview } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";
import { mailerService } from "../src/shared/mail/mailerService.js";
import { queueService } from "../src/shared/queue/queueService.js";

// Nothing leaves the machine: the mailer is faked, and keeps each link it was asked to send.
const mailed: string[] = [];
const sentLinks: string[] = [];
const mailedTexts: string[] = [];
(mailerService as any).sendMail = async (m: { to: string; text: string }) => {
  if (m.to.startsWith("oi-bad")) throw new Error("smtp 550");
  mailed.push(m.to);
  mailedTexts.push(m.text);
  sentLinks.push(/token=([0-9a-f]{64})/.exec(m.text)?.[1] ?? "");
};
const lastLink = () => sentLinks.at(-1)!;
(queueService as any).publish = async (queue: string, body: { to: string; text: string }) => {
  if (queue === "emails") await (mailerService as any).sendMail(body);
};

/** What a link can still do, read straight from the repo matchers acceptance itself uses. */
async function linkState(token: string): Promise<"pending" | "accepted" | "invalid"> {
  const hash = createHash("sha256").update(token).digest("hex");
  const row = await repo.findByTokenHash(hash);
  if (row?.status === "accepted") return "accepted";
  return row?.status === "pending" && (await repo.isLiveToken(hash)) ? "pending" : "invalid";
}

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

async function rejects(fn: () => Promise<unknown>): Promise<{ statusCode?: number } | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err as { statusCode?: number };
  }
}

const run = randomBytes(4).toString("hex");
const email = (tag: string) => `oi-${tag}-${run}@test-${run}.example`;
const createdEmails: string[] = [];

async function seedInvite(address: string, opts: { expired?: boolean; type?: "institution" | "business"; categoryId?: number } = {}) {
  const token = randomBytes(32).toString("hex");
  await repo.insertInvitation({
    email: address,
    type: opts.type ?? "institution",
    org_name: "Seeded Org",
    business_category_id: opts.categoryId ?? null,
    token_hash: createHash("sha256").update(token).digest("hex"),
    invited_by: null,
    expires_at: new Date(Date.now() + (opts.expired ? -1000 : 3_600_000)),
  });
  createdEmails.push(address);
  return token;
}

async function cleanup() {
  const users = await masterKnex("platform_users").whereIn("email", createdEmails).select("id");
  const userIds = users.map((u) => u.id);
  const institutions = await masterKnex("institutions").whereIn("platform_user_id", userIds).select("id", "schema_name", "source_job_id");
  for (const inst of institutions) {
    await masterKnex.raw(`DROP SCHEMA IF EXISTS ?? CASCADE`, [inst.schema_name]);
  }
  const businesses = await masterKnex("businesses").whereIn("owner_id", userIds).select("id", "schema_name");
  for (const biz of businesses) {
    await masterKnex.raw(`DROP SCHEMA IF EXISTS ?? CASCADE`, [biz.schema_name]);
  }
  await masterKnex("user_business_index").whereIn("platform_user_id", userIds).delete();
  await masterKnex("feed_posts").whereIn("business_id", businesses.map((b) => b.id)).delete().catch(() => {});
  await masterKnex("businesses").whereIn("id", businesses.map((b) => b.id)).delete();
  await masterKnex("onboarding_invitations").whereIn("email", createdEmails).delete();
  await masterKnex("user_institution_index").whereIn("platform_user_id", userIds).delete();
  await masterKnex("auth_sessions").whereIn("platform_user_id", userIds).delete();
  await masterKnex("institutions").whereIn("id", institutions.map((i) => i.id)).delete();
  await masterKnex("superadmin.extraction_jobs").whereIn("id", institutions.map((i) => i.source_job_id).filter(Boolean)).delete();
  await masterKnex("platform_users").whereIn("id", userIds).delete();
}

try {
  const cat = async (slug: string) => (await masterKnex("business_categories").where({ slug }).first("id")).id as number;
  const institutionsCat = await cat("institutions");
  const agencyCat = await cat("education_agency");

  console.log("\n2. send refuses an address that already has an account or invite");
  const existing = await masterKnex("platform_users").whereNull("deleted_at").first("id", "email");
  const fresh = email("fresh");
  createdEmails.push(fresh);
  const sent = await sendInvitation(fresh, "Fresh University", institutionsCat, existing.id);
  assert(sent.email === fresh && sent.type === "institution", "new email invited as an institution", sent);
  const freshRow = await masterKnex("onboarding_invitations").where({ email: fresh }).first("org_name");
  assert(freshRow?.org_name === "Fresh University", "the admin's name is stored on the invite", freshRow);
  const kinds = (err: unknown) => ((err as { details?: { matches?: { kind: string }[] } })?.details?.matches ?? []).map((m) => m.kind);
  const taken = await rejects(() => sendInvitation(existing.email, "Taken", institutionsCat, existing.id));
  assert(taken?.statusCode === 409 && kinds(taken).includes("user"), "existing account → 409 naming Users", taken);
  const again = await rejects(() => sendInvitation(fresh, "Fresh University", institutionsCat, existing.id));
  assert(again?.statusCode === 409 && kinds(again).join() === "invite", "second invite to same email → 409 naming the invite", again);

  console.log("\n2b. the email goes out within the send, and its outcome is recorded");
  assert(mailed.join() === fresh && sent.email_status === "sent", "only the invited address was mailed, reported as sent", { mailed, sent });
  const agencyEmail = email("agency");
  createdEmails.push(agencyEmail);
  await sendInvitation(agencyEmail, "Agency Co", agencyCat, existing.id);
  const agencyRow = await masterKnex("onboarding_invitations").where({ email: agencyEmail }).first();
  assert(agencyRow?.type === "business" && agencyRow?.business_category_id === agencyCat, "any other category → business invite carrying it", agencyRow);
  assert(agencyRow?.email_status === "sent" && agencyRow?.email_sent_at, "success recorded", agencyRow);
  const unknown = await rejects(() => sendInvitation(email("nocat"), "No Cat", 999999, existing.id));
  assert(unknown?.statusCode === 400, "unknown category → 400", unknown);
  const badEmail = email("bad");
  createdEmails.push(badEmail);
  const bad = await sendInvitation(badEmail, "Bad Mail", institutionsCat, existing.id);
  const badRow = await masterKnex("onboarding_invitations").where({ email: badEmail }).first("status", "email_status", "email_error");
  assert(bad.email_status === "failed" && badRow.email_error === "smtp 550", "a failed email is reported and recorded, not thrown", { bad, badRow });
  assert(badRow.status === "pending", "the invite stays open so Resend can retry", badRow);
  const hung = await rejects(() => withTimeout(new Promise(() => {}), 20));
  assert((hung as Error | null)?.message?.includes("may still arrive") === true, "a send that never resolves stops being awaited", hung);

  console.log("\n3. accept creates personal account + institution, but no session");
  const address = email("accept");
  const token = await seedInvite(address);
  const accepted = await acceptInvitation(token, "institution");
  assert(accepted.email === address && accepted.type === "institution", "returns the email to pre-fill sign-in", accepted);
  assert(!("access_token" in accepted), "no tokens handed to whoever opened the link", accepted);

  const user = await masterKnex("platform_users").where({ email: address }).first();
  assert(user?.is_personal_account === true, "personal account flag");
  assert(user?.is_institution_account === true, "institution account flag");
  assert(user?.account_status === 1 && user?.is_email_verified === true, "active, so the OTP sign-in that follows just works");
  const sessions = await masterKnex("auth_sessions").where({ platform_user_id: user.id }).count("* as n").first();
  assert(Number(sessions?.n) === 0, "no login session was created by opening the link", sessions);

  const inst = await masterKnex("institutions").where({ platform_user_id: user.id }).first();
  assert(inst?.email === address && inst?.account_status === 1, "institution owned by the invited email", inst);
  assert(inst?.claim_status === "claimed", "the institution is claimed");
  assert(inst?.institution_name === "Seeded Org", "named as the admin entered it", inst?.institution_name);
  assert(inst?.subdomain?.startsWith("seeded-org"), "subdomain built from that name", inst?.subdomain);
  await writeInstitutionOverview(inst.source_job_id, { name: "Extracted Name" } as any);
  const kept = await masterKnex("institutions").where({ id: inst.id }).first("institution_name", "subdomain");
  assert(kept.institution_name === "Seeded Org" && kept.subdomain === inst.subdomain, "extraction never overwrites the admin's name or subdomain", kept);
  const owned = await rejects(() => sendInvitation(address, "Again", institutionsCat, existing.id));
  assert(kinds(owned).includes("user") && kinds(owned).includes("institution"), "an onboarded email → 409 naming Users and Institutions", owned);
  assert((owned as Error).message.includes("Institutions"), "the message says where", (owned as Error).message);
  const extractedEmail = email("extracted");
  await writeInstitutionOverview(inst.source_job_id, { name: "Extracted Name", email: extractedEmail } as any);
  const extracted = await rejects(() => sendInvitation(extractedEmail, "Extracted", institutionsCat, existing.id));
  const extractionMatch = (extracted as { details?: { matches?: { kind: string; id: string }[] } })?.details?.matches?.[0];
  assert(extractionMatch?.kind === "extraction" && extractionMatch.id === inst.source_job_id, "an email only in an extraction → 409 pointing at that job", extracted);
  const biz = await masterKnex("businesses").whereRaw("lower(email) = ?", [address]).first();
  assert(!biz, "nothing written to businesses");

  const invite = await masterKnex("onboarding_invitations").where({ email: address }).first();
  assert(invite.status === "accepted" && invite.accepted_institution_id === inst.id, "invite marked accepted", invite);

  console.log("\n3b. a business invite creates a claimed business in the invited category");
  const bizAddress = email("bizaccept");
  const bizToken = await seedInvite(bizAddress, { type: "business", categoryId: agencyCat });
  const bizAccepted = await acceptInvitation(bizToken, "business");
  assert(bizAccepted.email === bizAddress, "returns the email to pre-fill sign-in", bizAccepted);
  const bizUser = await masterKnex("platform_users").where({ email: bizAddress }).first();
  const newBiz = await masterKnex("businesses").where({ owner_id: bizUser.id }).first();
  assert(newBiz?.business_category_id === agencyCat && newBiz?.claim_status === "claimed", "business owned, claimed, in the invited category", newBiz);
  assert(newBiz?.business_name === "Seeded Org", "business named as the admin entered it", newBiz?.business_name);
  assert(!(await masterKnex("institutions").where({ platform_user_id: bizUser.id }).first()), "nothing written to institutions");
  const bizInvite = await masterKnex("onboarding_invitations").where({ email: bizAddress }).first();
  assert(bizInvite.status === "accepted" && bizInvite.accepted_business_id === newBiz.id, "invite marked accepted with the business", bizInvite);

  console.log("\n4. a used, mistyped or expired link does not sign in");
  const reused = await rejects(() => acceptInvitation(token, "institution"));
  assert(reused?.statusCode === 409, "second accept → 409", reused);

  const typed = await seedInvite(email("typed"));
  const mistyped = await rejects(() => acceptInvitation(typed, "business"));
  assert(mistyped?.statusCode === 404, "type in the link must match the invite", mistyped);

  const expired = await seedInvite(email("expired"), { expired: true });
  const late = await rejects(() => acceptInvitation(expired, "institution"));
  assert(late?.statusCode === 410 && (late as { code?: string }).code === "INVITE_EXPIRED", "expired link → 410 INVITE_EXPIRED", late);
  const bogus = await rejects(() => acceptInvitation("not-a-real-token", "institution"));
  assert(bogus?.statusCode === 404, "unknown link → 404", bogus);

  console.log("\n4c. an expired or revoked link can ask the admin for a new one");
  const requestRow = async (t: string) => masterKnex("onboarding_invitations")
    .where({ token_hash: createHash("sha256").update(t).digest("hex") }).first("id", "link_requested_at");
  mailed.length = 0;
  const asked = await requestNewLink(expired, "institution");
  assert(asked.requested && mailed.join() === "support@globalyapp.com", "an invite with no inviter on record goes to support", mailed);
  assert(Boolean((await requestRow(expired))?.link_requested_at), "the request is recorded for the admin list");
  const expiredId = (await requestRow(expired)).id;
  assert(mailedTexts.at(-1)?.includes(`tab=invites&resend=${expiredId}`) === true, "the email links straight to resending that invite", mailedTexts.at(-1));
  await requestNewLink(expired, "institution");
  assert(mailed.length === 1, "asking again the same day sends no second email", mailed);
  const revokedLink = await seedInvite(email("revokedask"));
  const revokedRow = await requestRow(revokedLink);
  const inviterAddress = email("inviter");
  const inviter = await masterKnex("platform_users").insert({ first_name: "In", last_name: "Viter", email: inviterAddress }).returning("id");
  createdEmails.push(inviterAddress);
  await masterKnex("onboarding_invitations").where({ id: revokedRow.id }).update({ invited_by: inviter[0].id });
  await revokeInvitation(revokedRow.id);
  const cancelled = await rejects(() => acceptInvitation(revokedLink, "institution"));
  assert((cancelled as { code?: string })?.code === "INVITE_REVOKED", "revoked link → INVITE_REVOKED", cancelled);
  mailed.length = 0;
  await requestNewLink(revokedLink, "institution");
  assert(mailed.join() === inviterAddress, "the request goes to the admin who sent the invite", mailed);
  const workingLink = await seedInvite(email("liveask"));
  const notLapsed = await rejects(() => requestNewLink(workingLink, "institution"));
  assert(notLapsed?.statusCode === 404, "a link that still works can't request a new one", notLapsed);
  const expiredReq = await requestRow(expired);
  await resendInvitation(expiredReq.id, { ifRequested: true });
  const answered = await masterKnex("onboarding_invitations").where({ id: expiredReq.id }).first("link_requested_at");
  assert(answered.link_requested_at === null, "resending answers the request", answered);
  const reopened = await rejects(() => resendInvitation(expiredReq.id, { ifRequested: true }));
  assert(reopened?.statusCode === 409, "opening the email's resend link again doesn't mail them another", reopened);

  console.log("\n4b. a resend adds a link, never kills the one already sent");
  const resendAddress = email("resend");
  const firstToken = await seedInvite(resendAddress);
  const resendRow = await masterKnex("onboarding_invitations").where({ email: resendAddress }).first("id");
  const resent = await resendInvitation(resendRow.id);
  const secondToken = lastLink();
  assert(resent.email_status === "sent" && Boolean(secondToken) && secondToken !== firstToken, "resend mails a new link", resent);
  assert((await linkState(firstToken)) === "pending", "the first email's link still works after a resend");
  await acceptInvitation(firstToken, "institution");
  assert((await linkState(secondToken!)) === "accepted", "either link reaches the same, now-accepted invite");
  const reusedOld = await rejects(() => acceptInvitation(secondToken!, "institution"));
  assert(reusedOld?.statusCode === 409, "no link of an accepted invite works again", reusedOld);
  const revokeAddress = email("revokeold");
  const revokeFirst = await seedInvite(revokeAddress);
  const revokeRow = await masterKnex("onboarding_invitations").where({ email: revokeAddress }).first("id");
  await resendInvitation(revokeRow.id);
  await revokeInvitation(revokeRow.id);
  assert((await linkState(revokeFirst)) === "invalid", "revoking kills earlier links too");

  const expiredAddress = email("expiredresend");
  const expiredLink = await seedInvite(expiredAddress, { expired: true });
  const expiredRow = await masterKnex("onboarding_invitations").where({ email: expiredAddress }).first("id");
  await resendInvitation(expiredRow.id);
  const freshLink = lastLink();
  assert((await linkState(expiredLink)) === "invalid", "resending an expired invite does not revive its old link");
  const revived = await rejects(() => acceptInvitation(expiredLink, "institution"));
  assert(revived?.statusCode === 404, "the expired link still can't create an account", revived);
  assert((await linkState(freshLink!)) === "pending", "the resent link works");

  const liveAddress = email("liveold");
  const liveLink = await seedInvite(liveAddress);
  const liveRow = await masterKnex("onboarding_invitations").where({ email: liveAddress }).first("id");
  await masterKnex("onboarding_invitations").where({ id: liveRow.id }).update({ expires_at: new Date(Date.now() + 1500) });
  await resendInvitation(liveRow.id);
  assert((await linkState(liveLink)) === "pending", "an unexpired old link works right after a resend");
  await new Promise((r) => setTimeout(r, 2000));
  assert((await linkState(liveLink)) === "invalid", "…and dies at its own deadline, not the extended one");

  console.log("\n4d. delete removes the invite and its link");
  const doomedLink = await seedInvite(email("doomed"));
  const doomed = await masterKnex("onboarding_invitations").where({ token_hash: createHash("sha256").update(doomedLink).digest("hex") }).first("id");
  await deleteInvitation(doomed.id);
  assert(!(await masterKnex("onboarding_invitations").where({ id: doomed.id }).first()), "the row is gone");
  assert((await linkState(doomedLink)) === "invalid", "its link no longer works");
  const deletedTwice = await rejects(() => deleteInvitation(doomed.id));
  assert(deletedTwice?.statusCode === 404, "deleting a missing invite → 404", deletedTwice);

  console.log("\n5. revoke and accept can't overwrite each other");
  const raceAddress = email("race");
  await seedInvite(raceAddress);
  const race = await masterKnex("onboarding_invitations").where({ email: raceAddress }).first("id");
  await masterKnex("onboarding_invitations").where({ id: race.id }).update({ status: "accepted" });
  const lateRevoke = await rejects(() => revokeInvitation(race.id));
  assert(lateRevoke?.statusCode === 404 || lateRevoke?.statusCode === 409, "revoking an accepted invite is refused", lateRevoke);
  await masterKnex("onboarding_invitations").where({ id: race.id }).update({ status: "revoked" });
  await repo.revertToPending(race.id);
  const afterRevert = await masterKnex("onboarding_invitations").where({ id: race.id }).first("status");
  assert(afterRevert.status === "revoked", "a failed accept's release never re-opens a revoked link", afterRevert);
  assert(!(await repo.transitionStatus(race.id, "pending", "revoked")), "conditional update reports a lost race");

} catch (err) {
  failed++;
  console.error("  FAIL unexpected error", err);
} finally {
  await cleanup().catch((err) => console.error("cleanup failed", err));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
