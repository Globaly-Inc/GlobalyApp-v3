/**
 * Link a promoted institution to its owner directly — the same end state
 * `acceptInstitutionClaim` reaches, without walking the public claim-token email flow.
 *
 * For a promoted institution (public.institutions with platform_user_id NULL,
 * claim_status='unclaimed') whose contact email already has — or should have — a
 * platform_user, this writes the SAME rows the real claim accept does, through the SAME
 * choke-point functions (never inserting into `members` / `user_institution_index` directly —
 * see institution-members.service.ts's own comment on why both must move together):
 *
 *   1. platform_users            find-by-email, or create if none exists yet
 *   2. institutions              platform_user_id, first_name/last_name, claim_status='claimed'
 *   3. <tenant schema>           provisioned if it wasn't already (provisionOnClaim)
 *   4. <tenant>.members          owner row                        \ institutionMembers
 *      public.user_institution_index  owner row, is_owner=true    / .addMember (one call, both)
 *   5. platform_users.is_institution_account, account_categories
 *   6. institutions.account_status = 1                (enterable only once everything above exists)
 *   7. enquiry_distributions → tenant inbox reconciled (best-effort, matches acceptInstitutionClaim)
 *
 * Deliberately NOT done here, unlike the real accept flow: no "we've just joined GlobalyApp"
 * feed post. That is public-facing content on the institution's behalf — posting it without
 * being asked is a different kind of action than fixing a DB link, so it is left out.
 *
 * Usage:
 *   node --import tsx scripts/link-institution-owner.ts --institution-id 55            (dry run)
 *   node --import tsx scripts/link-institution-owner.ts --institution-id 55 --apply
 *   node --import tsx scripts/link-institution-owner.ts --email uwvic@uw.edu --apply
 *
 * Idempotent: an institution that already has platform_user_id set is left untouched and the
 * script reports it as already linked rather than re-running.
 *
 * --reset-signup: for exactly the case this was built for — the contact email was, before any
 * claim link existed, walked through ordinary self-serve /auth/register (the INSTITUTION_CLAIM_
 * AVAILABLE check that should have caught it did not exist yet). That leaves a bare personal
 * platform_user: is_personal_account=true, one auth_sessions row, and nothing else — no profile,
 * no wallet, no orders (checked before writing this). This flag deletes that session and clears
 * is_personal_account before linking, so the account becomes an institution member rather than
 * staying a personal one that also happens to own an institution. Refuses to touch anything if
 * platform_user_profiles/credit_wallets/audit_logs hold rows for that user — a real established
 * personal account gaining institution membership on top keeps its personal side; only a bare
 * signup shell gets demoted.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { provisionOnClaim } from "../src/core/business/provisioner.js";
import { getKnex } from "../src/core/db/pool-manager.js";
import { schemaName } from "../src/core/db/knex.js";
import * as repo from "../src/modules/platform-users/repositories/platform-users.repository.js";
import * as institutionMembers from "../src/modules/platform-users/services/institution-members.service.js";
import { reconcileTenantMirror } from "../src/modules/enquiries/services/tenant-sync.service.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const resetSignup = args.includes("--reset-signup");
const idArg = args[args.indexOf("--institution-id") + 1];
const emailArg = args[args.indexOf("--email") + 1];

if (!idArg && !emailArg) {
  console.error("usage: link-institution-owner.ts (--institution-id <id> | --email <email>) [--apply]");
  process.exit(2);
}

interface Institution {
  id: number;
  institution_name: string;
  email: string | null;
  phone: string | null;
  institution_type: string | null;
  platform_user_id: number | null;
  first_name: string | null;
  last_name: string | null;
  account_status: number;
  claim_status: string;
  schema_name: string;
  schema_provisioned_at: string | null;
}

async function findInstitution(): Promise<Institution | undefined> {
  const q = masterKnex<Institution>("institutions");
  return idArg ? q.where({ id: Number(idArg) }).first() : q.whereRaw("lower(email) = lower(?)", [emailArg]).first();
}

async function main() {
  const institution = await findInstitution();
  if (!institution) {
    console.error(idArg ? `no institution with id ${idArg}` : `no institution with email ${emailArg}`);
    process.exit(1);
  }

  console.log(`institution ${institution.id}: ${institution.institution_name} <${institution.email}>`);

  if (institution.platform_user_id) {
    console.log(`already linked — platform_user_id=${institution.platform_user_id}, claim_status=${institution.claim_status}. Nothing to do.`);
    await masterKnex.destroy();
    return;
  }
  if (!institution.email) {
    console.error("this institution has no contact email — nothing to link an owner against");
    process.exit(1);
  }

  const owner = await repo.findByEmail(institution.email);
  if (!owner) {
    console.error(
      `no platform_user exists for ${institution.email} yet. This script links an EXISTING account ` +
      `as owner (the same reuse rule acceptInstitutionClaim follows: "a pre-existing user on the ` +
      `claim address is reused, not duplicated"); it does not invent a name for one that has never ` +
      `signed up. Have the contact address register first, or pass a real name to create one.`,
    );
    process.exit(1);
  }

  console.log(`owner: platform_user ${owner.id} — ${owner.first_name} ${owner.last_name} <${owner.email}>`);
  console.log(`schema: ${institution.schema_name} (provisioned: ${institution.schema_provisioned_at ? "yes" : "no"})`);

  let signupToRemove: { sessions: number } | null = null;
  if (resetSignup) {
    const [{ count: profiles }] = await masterKnex("platform_user_profiles").where({ user_id: owner.id }).count("id");
    const [{ count: wallets }] = await masterKnex("credit_wallets").where({ platform_user_id: owner.id }).count("id");
    const [{ count: logs }] = await masterKnex("audit_logs").where({ platform_user_id: owner.id }).count("id");
    if (Number(profiles) || Number(wallets) || Number(logs)) {
      console.log(`--reset-signup: platform_user ${owner.id} has profile/wallet/audit rows — it is a real personal ` +
        `account, not a bare signup shell. Leaving is_personal_account and its sessions alone.`);
    } else {
      const sessions = await masterKnex("auth_sessions").where({ platform_user_id: owner.id }).count("id").first();
      signupToRemove = { sessions: Number(sessions?.count ?? 0) };
      console.log(`--reset-signup: will clear is_personal_account and delete ${signupToRemove.sessions} auth_sessions row(s)`);
    }
  }

  if (!apply) {
    console.log("\nDRY RUN — would set institutions.platform_user_id, provision the schema if needed,");
    console.log("add the tenant owner membership, and flip account_status to 1. Pass --apply to write.");
    await masterKnex.destroy();
    return;
  }

  if (signupToRemove) {
    await masterKnex("auth_sessions").where({ platform_user_id: owner.id }).delete();
    await repo.updateUser(owner.id, { is_personal_account: false });
    console.log(`✓ signup removed — ${signupToRemove.sessions} session(s) deleted, is_personal_account cleared`);
  }

  // 1. Institution ↔ owner. Names taken from the existing account, matching resolveClaimant's
  // "their own stored name is left untouched" rule — nobody filled in a claim form here, so the
  // account's own name is the closest thing to one.
  await repo.updateInstitution(institution.id, {
    platform_user_id: owner.id,
    first_name: owner.first_name,
    last_name: owner.last_name,
  });
  console.log("✓ institutions.platform_user_id set");

  // 2. Tenant schema — idempotent (CREATE SCHEMA IF NOT EXISTS + migrate.latest()).
  await provisionOnClaim({ kind: "institution", id: institution.id, schema_name: institution.schema_name });
  console.log("✓ tenant schema provisioned");

  // 3. The one choke point for institution membership — writes <tenant>.members AND
  // user_institution_index together, plus platform_users.is_institution_account.
  const db = await getKnex(institution.schema_name, schemaName(institution.schema_name));
  await institutionMembers.addMember(db, institution.id, {
    platform_user_id: owner.id,
    role: "owner",
    is_owner: true,
    first_name: owner.first_name,
    last_name: owner.last_name,
    email: owner.email,
    phone: owner.phone,
  });
  console.log("✓ tenant members + user_institution_index owner row");

  // acceptInstitutionClaim sets is_personal_account here unconditionally (matching the claimant
  // flow, where whoever accepts also gets a personal side by default) — skipped when this run
  // just cleared it above, since that would immediately undo the removal that was asked for.
  if (!signupToRemove) await repo.updateUser(owner.id, { is_personal_account: true });
  await repo.addAccountCategory(owner.id, {
    type: "institution",
    role: institution.institution_type || "institution",
  });

  // acceptInstitutionClaim also clears claim_status (unclaimed → claimed) and the now-unneeded
  // token via clearInstitutionClaim — missed on the first run of this script, caught by
  // re-checking every touched row afterwards. findUnclaimedInstitutionByContactEmail filters on
  // this column, so leaving it 'unclaimed' would keep the institution showing as claimable.
  await repo.clearInstitutionClaim(institution.id);
  console.log("✓ institutions.claim_status = 'claimed'");

  // 4. Enterable only once everything above exists — same ordering acceptInstitutionClaim uses.
  await repo.updateInstitution(institution.id, { account_status: 1 });
  console.log("✓ institutions.account_status = 1");

  // 5. Best-effort, matching acceptInstitutionClaim: leads that arrived while nobody could sign
  // in are copied into the tenant inbox now that one exists. Never fails the run — the owner
  // link above is already committed and correct either way.
  await reconcileTenantMirror({ kind: "institution", id: institution.id }).catch((err) => {
    console.warn(`  (tenant mirror reconcile skipped: ${err instanceof Error ? err.message : String(err)})`);
  });

  console.log(`\ndone — ${institution.institution_name} is now owned by ${owner.email} and enterable.`);
  await masterKnex.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });
