// Institution claim — the counterpart to the businesses claim flow.
//
// Institutions only need claiming because promote (data-extraction) can now create one
// that nobody owns yet: a public row pointing at an extraction job, owned by a placeholder
// platform_user, with no tenant schema. Claiming is what turns that into a real tenant —
// it provisions the schema and makes the owner a member. This mirrors the business claim
// flow step for step; the two tables exist to keep institution and business rows apart, not
// because the flows differ.
//
// Self-service institutions from onboardInstitution are born claim_status='claimed' and
// never touch this path.

import { randomBytes } from "node:crypto";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import { config } from "../../../config.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { provisionOnClaim } from "../../../core/business/provisioner.js";
import { claimBusinessEmail } from "../../../shared/mail/templates.js";
import { queueEmail } from "../../auth/auth.service.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as repo from "../repositories/platform-users.repository.js";
import * as institutionMembers from "./institution-members.service.js";
import { createSystemPost } from "../../feed/services/feed.service.js";
import { guessImageMimeType } from "../../feed/services/feed-media.service.js";
import { backfillInstitutionDistributions } from "../../enquiries/services/tenant-sync.service.js";

const logger = createChildLogger("institution-claim-service");
const WELCOME_POST_IMAGE = `${config.WEB_APP_URL}/welcome-post.png`;
const CLAIM_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours, matching the business claim flow

/**
 * Who ends up owning the institution — the institution twin of businesses' resolveClaimant.
 *
 * A promoted institution has platform_user_id, first_name and last_name all NULL, because
 * extraction gives a school's email but never a contact person. The claimant's name arrives
 * here, becomes their platform_user, and is written onto the institution row so its
 * first_name/last_name finally describe a real person.
 *
 * A pre-existing user on the claim address is reused, not duplicated — the claim link went to
 * that address. Their own stored name is left untouched.
 */
async function resolveClaimant(
  institution: { id: number; platform_user_id: number | null; email: string | null; phone: string | null },
  claimant: { first_name: string; last_name: string },
) {
  if (institution.platform_user_id) return repo.findByIdFull(institution.platform_user_id);

  const email = institution.email;
  if (!email) throw new ConflictError("This listing has no contact email to claim against");

  const existing = await repo.findByEmail(email);
  const owner =
    existing ??
    (await repo.insert({
      first_name: claimant.first_name,
      last_name: claimant.last_name,
      email,
      phone: institution.phone ?? undefined,
      account_status: 0,
      meta: { created_via: "institution_claim" },
    }));

  // The names go on the institution row too: they are NOT NULL-able now but were left blank by
  // promote, and institutions.first_name/last_name are what the admin list shows as the owner.
  await repo.updateInstitution(institution.id, {
    platform_user_id: owner.id,
    first_name: claimant.first_name,
    last_name: claimant.last_name,
  });
  return owner;
}

/**
 * Issues a fresh claim link for an institution nobody owns yet.
 *
 * Exported because the claim page is not the only thing that needs one: an enquiry falling back
 * to an unclaimed institution has to put a way in inside its notification, or the mail asks
 * someone to sign into an account that cannot be signed into.
 *
 * A new token supersedes the previous one — the newest link is always the live one.
 */
export async function mintInstitutionClaimUrl(institutionId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await repo.setInstitutionClaimPending(institutionId, token, new Date(Date.now() + CLAIM_TOKEN_TTL_MS));
  return `${config.WEB_APP_URL}/invite/institution/accept?token=${token}`;
}

/**
 * Self-serve claim trigger. Resolves silently either way — no found/not-found signal, same
 * anti-enumeration stance as requestClaimByEmail on the business side.
 */
export async function requestInstitutionClaim(email: string): Promise<void> {
  // Matched on the institution's own contact email — a promoted listing has no owner yet.
  const institution = await repo.findUnclaimedInstitutionByContactEmail(email);
  if (!institution) return;

  const claimUrl = await mintInstitutionClaimUrl(institution.id);
  // Personalise only if someone already registered on this address.
  const existingUser = await repo.findByEmail(email);
  const ownerName =
    `${existingUser?.first_name ?? ""} ${existingUser?.last_name ?? ""}`.trim() || "there";
  // ponytail: reusing the business claim template. The copy is generic ("an account for X
  // has been created") — an institution-specific one can wait until the wording matters.
  queueEmail({
    to: email,
    ...claimBusinessEmail({ ownerName, businessName: institution.institution_name, claimUrl }),
  }).catch((err) => logger.warn("Institution claim email failed", { institutionId: institution.id, err: err.message }));
}

export async function acceptInstitutionClaim(
  token: string,
  claimant: { first_name: string; last_name: string },
) {
  const institution = await repo.findInstitutionByClaimToken(token);
  if (!institution) throw new NotFoundError("This claim link is invalid or has already been used");
  if (!institution.claim_token_expires_at || new Date(institution.claim_token_expires_at) < new Date()) {
    throw new ConflictError("This claim link has expired");
  }

  const owner = await resolveClaimant(institution, claimant);
  // From `owner`, not institution.platform_user_id: that column was NULL on the row we fetched
  // and resolveClaimant has only just set it, so this copy is stale.
  if (!owner) throw new NotFoundError("Owner for this institution could not be resolved");

  await repo.clearInstitutionClaim(institution.id);

  // Promoted listings have no schema until now. The extracted course catalog is NOT copied
  // in — it is read through institutions.source_job_id, so the schema only needs to hold
  // tenant-owned state, which today is the owner member.
  if (!institution.schema_provisioned_at) {
    await provisionOnClaim({
      kind: "institution",
      id: Number(institution.id),
      schema_name: institution.schema_name,
    });

    // addMember writes the tenant `members` row AND user_institution_index. The index is what
    // makes login hand out institution context — without it the owner would claim
    // successfully and then find no institution to enter. Idempotent, so a retried claim is
    // a no-op rather than a 500.
    const db = await getKnex(institution.schema_name, schemaName(institution.schema_name));
    await institutionMembers.addMember(db, Number(institution.id), {
      platform_user_id: owner.id,
      role: "owner",
      is_owner: true,
      first_name: owner.first_name,
      last_name: owner.last_name,
      email: owner.email,
      phone: owner.phone,
    });

    await repo.updateUser(owner.id, { is_personal_account: true });
    await repo.addAccountCategory(owner.id, {
      type: "institution",
      role: institution.institution_type ?? "institution",
    });

    // Last, exactly as activateClaimedListing does for a business: account_status 1 is what
    // makes the institution resolvable by findInstitutionBySchemaName and
    // listUserInstitutions, so it must not flip until the schema and the owner member exist.
    await repo.updateInstitution(institution.id, { account_status: 1 });

    // Leads that arrived while nobody could sign in — the enquiry fallback mails unclaimed
    // institutions precisely to get them here, so the schema starts with them already in it.
    await backfillInstitutionDistributions(Number(institution.id));

    logger.info("Promoted institution claimed", { institutionId: institution.id, jobId: institution.source_job_id });

    createSystemPost({
      authorId: owner.id,
      institutionId: Number(institution.id),
      content: `**@all** 🎉 We've just joined **GlobalyApp**! Excited to be part of the community.`,
      media: [
        {
          storage_path: institution.logo_url ?? WELCOME_POST_IMAGE,
          type: "image",
          mime_type: institution.logo_url ? guessImageMimeType(institution.logo_url) : "image/png",
        },
      ],
    }).catch((err) => logger.warn("Welcome post creation error", { institutionId: institution.id, err: err.message }));
  }

  // The owner's platform_users row may still be account_status 0 (placeholder). OTP
  // verification promotes it to 1, same as for an invited user — nothing to do here. That is
  // the platform_users column, unrelated to the institutions one set above.
  return { email: owner?.email ?? null, institution_name: institution.institution_name };
}
