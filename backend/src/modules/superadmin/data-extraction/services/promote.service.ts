// Promote service — publishes an extraction job as a live listing.
//
// Promote writes ONLY public rows: the owner placeholder, the institutions/businesses
// listing, and the representation links for scraped agents. It does NOT create the tenant
// schema. A schema per promoted job would mean tens of thousands of tables nobody owns, and
// nothing is lost by waiting: the extracted catalog is never copied, it is read through
// source_job_id. The schema is built when the owner accepts the claim email — see
// businesses.service acceptClaim / institution-claim.service acceptInstitutionClaim.
//
// Routing is by CATEGORY, not by source_type. business_category_id 1 ('institutions') →
// institutions; every other category → businesses. source_type only names the scraping
// pipeline and defaults to 'institution' for every job, so routing on it would file every
// education agency and accreditation body as an institution.
//
// Scraped agents from extraction_agents become their own unclaimed businesses linked back to
// the job through `representations`.
//
// Re-runnable: every write is keyed on provenance (source_job_id / source_agent_id), so
// promoting an already-exported job reconciles it instead of duplicating.

import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { slugifyCourseName } from "../../../search/utils/slug.js";
import * as userRepo from "../../../platform-users/repositories/platform-users.repository.js";
import { logAudit } from "../shared/audit.js";
import * as jobsRepo from "../repositories/jobs.repository.js";
import * as repo from "../repositories/promote.repository.js";
import type { OverviewRow, AgentRow } from "../repositories/promote.repository.js";
import { PROMOTABLE_JOB_STATUSES } from "../schemas/jobs.schema.js";

/**
 * RFC 2606 reserved TLD — guaranteed unroutable, so a synthetic owner address can never
 * accidentally deliver mail to a real person.
 */
const PLACEHOLDER_EMAIL_DOMAIN = "unclaimed.globalyhub.invalid";

/** uuid → 8 hex chars, for disambiguating subdomains and synthetic emails. */
function seedFrom(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

/**
 * The platform_users row an owner-bearing listing starts out owned by.
 *
 * Only called where extraction captured a real person/agency name — an agent row. A listing
 * with no named agent stays ownerless until a claimant supplies their own name.
 *
 * MUST be idempotent per address, including the synthetic one. The same agent is resolved twice
 * in a single promote — once as the primary listing's owner, once for its own agency business —
 * and a promote can be re-run to reconcile. Looking up before inserting is what stops the second
 * pass colliding on platform_users.email; skipping the lookup when `email` was null (so both
 * passes computed the same `unclaimed+<seed>@…`) was a live 500.
 *
 * A real user already on the address becomes the owner directly — the claim mail goes there
 * regardless, so reusing them is what makes the claim link work. Otherwise a placeholder is
 * created with account_status 0 (cannot sign in), on an unroutable address when extraction found
 * no contact at all.
 */
async function resolveAgentOwner(name: string, email: string | null, phone: string | null, seed: string) {
  // Resolve the address FIRST, then look it up — the synthetic address is as much a unique key
  // as a real one, and is deterministic from the agent id.
  const address = email ?? `unclaimed+${seed}@${PLACEHOLDER_EMAIL_DOMAIN}`;

  const existing = await userRepo.findByEmail(address);
  if (existing) return existing;

  return userRepo.insert({
    first_name: name,
    last_name: "",
    email: address,
    phone: phone ?? undefined,
    account_status: 0,
    meta: { created_via: "admin_extraction", placeholder: true },
  });
}

/**
 * The owner for the primary listing (institution or business) from the job's extracted agents.
 *
 * Extraction never captures a contact person for the entity itself — the overview has an email
 * and a phone and nothing else — so the only real name available is an agent's. If the job has
 * one, it becomes the listing's owner; if not, the listing stays ownerless and the claimant
 * supplies their name at accept time.
 *
 * Identical for both tables, so an institution and a business publish the same way.
 */
async function resolveListingOwnerFromAgents(jobId: string) {
  const agents = await repo.listAgentsByJobId(jobId);
  const named = agents.find((a) => a.name?.trim());
  if (!named) return null;

  return resolveAgentOwner(named.name!.trim(), named.email, named.phone, seedFrom(named.id));
}

/** Profile fields shared by institutions and businesses, straight off the overview row. */
function profileFrom(overview: OverviewRow | undefined, countryId: number | null) {
  return {
    description: overview?.description ?? null,
    logo_url: overview?.logo_url ?? null,
    website: overview?.website ?? null,
    country_id: countryId,
    state: overview?.state ?? null,
    city: overview?.city ?? null,
    address: overview?.address ?? null,
    postcode: overview?.zip_code ?? null,
    linkedin_url: overview?.linkedin_url ?? null,
    facebook_url: overview?.facebook_url ?? null,
    instagram_url: overview?.instagram_url ?? null,
    twitter_url: overview?.twitter_url ?? null,
    youtube_url: overview?.youtube_url ?? null,
  };
}

async function promoteInstitution(job: any, overview: OverviewRow | undefined) {
  const name = overview?.name ?? job.institution_name ?? "Untitled institution";
  const seed = seedFrom(job.id);
  const existing = await repo.findInstitutionByJobId(job.id);
  const countryId = await repo.findCountryId(overview?.country);

  // institutions.email is uniquely indexed where NOT NULL. Two jobs for the same school
  // would collide, so the loser keeps its address in meta rather than failing the promote.
  const email = overview?.email ?? null;
  const emailFree = email ? !(await repo.institutionEmailTaken(email, existing?.id ?? null)) : false;

  const fields = {
    institution_name: name,
    email: emailFree ? email : null,
    phone: overview?.phone ?? null,
    ...profileFrom(overview, countryId),
    meta: {
      created_via: "admin_extraction",
      source_url: overview?.source_url ?? job.institution_url ?? null,
      ...(email && !emailFree ? { contact_email: email } : {}),
    },
  };

  if (existing) {
    return { row: await repo.updateInstitution(existing.id, fields), created: false };
  }

  // Owner only when an extracted agent gives a real name; otherwise platform_user_id,
  // first_name and last_name all stay NULL and the claimant supplies their name at accept time.
  const owner = await resolveListingOwnerFromAgents(job.id);

  const row = await repo.insertInstitution({
    ...fields,
    ...(owner
      ? { platform_user_id: owner.id, first_name: owner.first_name, last_name: owner.last_name ?? "" }
      : {}),
    subdomain: await repo.claimSubdomain(slugifyCourseName(name), seed),
    source_job_id: job.id,
    status: "pending",
    claim_status: "unclaimed",
    // account_status stays 0 and schema_provisioned_at NULL until claim regardless of owner.
    // Both listUserInstitutions and the tenant plugin require account_status 1, so an unclaimed
    // listing can't be opened even once it has an owner.
  });
  return { row, created: true };
}

async function promoteBusiness(job: any, overview: OverviewRow | undefined) {
  const name = overview?.name ?? job.institution_name ?? "Untitled business";
  const seed = seedFrom(job.id);
  const existing = await repo.findPrimaryBusinessByJobId(job.id);
  const countryId = await repo.findCountryId(overview?.country);

  const fields = {
    business_name: name,
    business_category_id: job.business_category_id ?? null,
    email: overview?.email ?? null,
    phone: overview?.phone ?? null,
    ...profileFrom(overview, countryId),
    meta: {
      created_via: "admin_extraction",
      source_type: job.source_type ?? null,
      service_category_id: job.service_category_id ?? null,
      source_url: overview?.source_url ?? job.institution_url ?? null,
    },
  };

  if (existing) {
    return { row: await repo.updateBusiness(existing.id, fields), created: false };
  }

  // Same rule as promoteInstitution — the two tables publish identically.
  const owner = await resolveListingOwnerFromAgents(job.id);

  const row = await repo.insertBusiness({
    ...fields,
    ...(owner ? { owner_id: owner.id } : {}),
    subdomain: await repo.claimSubdomain(slugifyCourseName(name), seed),
    source_job_id: job.id,
    status: "unverified",
    claim_status: "unclaimed",
    // Ownerless is rendered correctly already: the admin list computes
    // `owner_id IS NULL as is_unclaimed` and shows "Unclaimed".
    //
    // account_status stays 0 until claim provisions the schema — findBusinessByDbName and
    // listUserBusinesses both require 1, so an unprovisioned listing can't be opened.
  });
  return { row, created: true };
}

/**
 * A scraped education agent becomes its own unclaimed business, linked back to the job.
 *
 * The one promote path that DOES create an owner: extraction_agents.name is the agency's own
 * name, so unlike the institution overview there is a real identity to attach. `agent.name`
 * being absent means there is nothing to own it, so it stays ownerless like any other listing.
 */
async function promoteAgent(agent: AgentRow, jobId: string) {
  const name = agent.name ?? "Untitled agency";
  const seed = seedFrom(agent.id);
  const existing = await repo.findBusinessByAgentId(agent.id);
  const countryId = await repo.findCountryId(agent.country);

  const owner = agent.name
    ? existing?.owner_id
      ? await userRepo.findByIdFull(existing.owner_id)
      : await resolveAgentOwner(name, agent.email, agent.phone, seed)
    : null;

  const fields = {
    business_name: name,
    business_type: "agent",
    // NOT the job's category: the job is the institution this agency represents, so inheriting
    // it would file the agency under "Institutions". A scraped education agent is its own
    // thing. Resolved by slug so a renumbered categories table can't point it elsewhere.
    business_category_id: await repo.findCategoryIdBySlug("education_agency"),
    email: agent.email,
    phone: agent.phone,
    website: agent.website,
    logo_url: agent.logo_url,
    country_id: countryId,
    state: agent.state,
    city: agent.city,
    // Agents carry either a single `address` or split street lines, never reliably both.
    address: agent.address ?? ([agent.street1, agent.street2].filter(Boolean).join(", ") || null),
    postcode: agent.postcode,
    meta: { created_via: "admin_extraction", source_agent_external_id: agent.external_id },
  };

  const row = existing
    ? await repo.updateBusiness(existing.id, fields)
    : await repo.insertBusiness({
        ...fields,
        // Omitted entirely rather than set to null when there is no owner, so the column keeps
        // its default and this reads as "not applicable" instead of "deliberately blank".
        ...(owner ? { owner_id: owner.id } : {}),
        subdomain: await repo.claimSubdomain(slugifyCourseName(name), seed),
        source_job_id: jobId,
        source_agent_id: agent.id,
        status: "unverified",
        claim_status: "unclaimed",
      });

  return { row, created: !existing };
}

/**
 * Which table this job belongs in.
 *
 * The category is authoritative. AgentCIS is the one exception: its importer only ever stages
 * education providers (stageAgentcisInstitution is the sole entity path, and its other insert
 * is always status 'failed', which is not promotable), and it sets no category — so the whole
 * V2 import would otherwise be unroutable.
 *
 * An uncategorised job from any other source is refused rather than guessed at. source_type
 * cannot stand in: it defaults to 'institution' for every job, so guessing from it is what
 * files education agencies as institutions. Keeping the two tables clean is the entire reason
 * they are separate.
 */
async function resolveIsInstitution(job: any): Promise<boolean> {
  if (job.business_category_id) return repo.isInstitutionCategory(Number(job.business_category_id));
  if (job.source_type === "agentcis") return true;

  throw new BadRequestError(
    "This job has no business category, so it cannot be routed to the institutions or businesses table. Set a category on the job first.",
  );
}

export async function promoteJob(jobId: string, adminId: number) {
  const job = await jobsRepo.findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");

  if (!PROMOTABLE_JOB_STATUSES.includes((job as any).status)) {
    throw new BadRequestError(
      `Job status "${(job as any).status}" is not promotable. Must be one of: ${PROMOTABLE_JOB_STATUSES.join(", ")}`,
    );
  }

  const overview = await repo.findOverviewByJobId(jobId);
  const isInstitution = await resolveIsInstitution(job);

  const listing = isInstitution ? await promoteInstitution(job, overview) : await promoteBusiness(job, overview);

  // Agents are scraped from institution directories, so they only ever accompany an
  // institution job — but promoting them is keyed on the rows existing, not on the category.
  const agents = await repo.listAgentsByJobId(jobId);
  let agentsCreated = 0;
  let agentsReused = 0;
  let representationsCreated = 0;
  for (const agent of agents) {
    const promoted = await promoteAgent(agent, jobId);
    if (promoted.created) agentsCreated++;
    else agentsReused++;
    if (await repo.linkRepresentation(promoted.row.id, jobId)) representationsCreated++;
  }

  await jobsRepo.updateJob(jobId, { status: "exported" });

  const result = {
    listing_type: isInstitution ? ("institution" as const) : ("business" as const),
    listing_id: Number(listing.row.id),
    listing_created: listing.created,
    subdomain: listing.row.subdomain as string,
    // The catalog is copied on claim, not here.
    schema_provisioned: false,
    agents_created: agentsCreated,
    agents_reused: agentsReused,
    representations_created: representationsCreated,
  };

  await logAudit(adminId, "EXTRACTION_PROMOTE", {
    entityType: "extraction_jobs",
    entityId: jobId,
    details: result,
  });

  return result;
}

/** Promotes many jobs in sequence, reporting per-job outcomes instead of failing the batch. */
export async function promoteJobs(jobIds: string[], adminId: number) {
  const results: Array<{ job_id: string; ok: boolean; error?: string }> = [];
  for (const jobId of jobIds) {
    try {
      await promoteJob(jobId, adminId);
      results.push({ job_id: jobId, ok: true });
    } catch (err) {
      results.push({ job_id: jobId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { promoted: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
