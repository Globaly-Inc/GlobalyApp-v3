// Staging logic for one AgentCIS institution — port of V2's stageInstitution.
// Pulled out of extraction-agentcis.worker.ts so the worker stays a thin queue consumer
// and this reusable staging/mapping logic lives in lib/ like the rest of the module.
// Per-product writes live in agentcis-product-staging.ts to stay under 300 lines here.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { writeInstitutionOverview, upsertCampus, writeJobEvent } from "./staging-writer.js";
import { coerceLabel, isDeactivated, pickActiveContact, mapCountry } from "./agentcis-mappers.js";
import { stageProduct, newStagingCounters } from "./agentcis-product-staging.js";

const logger = createChildLogger("agentcis-staging");

// ── Progress tracking ──
//
// pipeline_progress is jsonb — merge with the `||` operator instead of read-modify-write,
// so agentcis_id (set once, at creation) and the running per-phase counters below survive
// every subsequent update instead of being clobbered by a full JSON.stringify replace.
export async function mergeProgress(jobId: string, patch: Record<string, unknown>): Promise<void> {
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    pipeline_progress: masterKnex.raw(`COALESCE(pipeline_progress, '{}'::jsonb) || ?::jsonb`, [JSON.stringify(patch)]),
    processing_heartbeat_at: masterKnex.fn.now(),
  });
}

export async function stageAgentcisInstitution(
  inst: Record<string, unknown>,
  institutionId: string,
): Promise<string | null> {
  const name = (inst.name as string)?.trim();
  if (!name) {
    logger.warn("Skipping institution with no name", { id: inst.id });
    return null;
  }
  if (isDeactivated(inst)) {
    logger.info("Skipping deactivated institution", { name, id: inst.id });
    return null;
  }

  const website = (inst.website as string) || `https://agentcis.com/institution/${inst.id}`;
  const activeContact = pickActiveContact(inst);

  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({
      institution_name: name,
      institution_url: website,
      status: "processing",
      source_type: "agentcis",
      aggregator_name: "AgentCIS",
      pipeline_progress: JSON.stringify({ phase: "institution", current: 0, total: 0, agentcis_id: institutionId }),
      processing_heartbeat_at: masterKnex.fn.now(),
    })
    .returning("id");

  const jobId = job.id as string;
  const counters = newStagingCounters();

  try {
    await writeInstitutionOverview(jobId, {
      name,
      website,
      email: activeContact.email,
      phone: activeContact.phone,
      address: (inst.street as string) || (inst.address as string) || null,
      city: (inst.city as string) || null,
      state: (inst.state as string) || null,
      country: mapCountry(inst.country),
      zip_code: resolvePostcode(inst),
      description:
        (inst.about as string) ||
        (inst.overview as string) ||
        (inst.description as string) ||
        null,
      logo_url: (inst.logo as string) || (inst.logo_url as string) || null,
      source_url: website,
      facebook_url: (inst.facebook as string) || null,
      instagram_url: (inst.instagram as string) || null,
      twitter_url: (inst.twitter as string) || null,
      linkedin_url: (inst.linkedin as string) || null,
      youtube_url: (inst.youtube as string) || (inst.video_url as string) || null,
    });

    // Branches → campuses
    const allBranches = (inst.branches || []) as Record<string, unknown>[];
    const branches = allBranches.filter((b) => !isDeactivated(b));
    counters.skipped_branches = allBranches.length - branches.length;
    const campusMap: Record<string, string> = {}; // key → campus_id
    const campusIds: string[] = [];

    for (const br of branches) {
      const cName = (coerceLabel(br.name) || coerceLabel(br.campus_name) || "").trim();
      if (!cName) continue;

      const campusId = await upsertCampus(jobId, {
        name: cName,
        address: (br.street as string) || (br.address as string) || null,
        city: (br.city as string) || null,
        state: (br.state as string) || null,
        country: mapCountry(br.country),
        phone: (br.phone_number as string) || (br.phone as string) || null,
        email: (br.email as string) || null,
      });

      if (campusId) {
        campusMap[cName.toLowerCase()] = campusId;
        if (br.id != null) campusMap[String(br.id)] = campusId;
        campusIds.push(campusId);
        counters.branches_extracted++;
      }
    }

    // Products → courses + child entities
    const allProducts = (inst.products || []) as Record<string, unknown>[];
    const products = allProducts.filter((p) => !isDeactivated(p));
    counters.skipped_products = allProducts.length - products.length;

    for (const p of products) {
      const cName = coerceLabel(p.name).trim();
      if (!cName) continue;

      await stageProduct(jobId, p, cName, name, website, campusMap, campusIds, counters);

      // Heartbeat every 5 courses
      if (counters.courses_extracted % 5 === 0) {
        await mergeProgress(jobId, { phase: "courses", current: counters.courses_extracted, total: products.length, ...counters });
      }
    }

    await mergeProgress(jobId, { phase: "done", ...counters });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "done",
      courses_extracted: counters.courses_extracted,
      updated_at: masterKnex.fn.now(),
    });

    await writeJobEvent(jobId, "agentcis_import_complete", {
      message: `Staged ${counters.courses_extracted} courses, ${counters.branches_extracted} campuses`,
    });

    return jobId;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    logger.error("AgentCIS staging failed", { jobId, error: msg });
    await mergeProgress(jobId, { phase: "failed", error: msg, ...counters });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "failed",
      error_message: msg,
      updated_at: masterKnex.fn.now(),
    });
    return null;
  }
}

// ponytail: inline postcode resolver — full normalizer only needed here
function resolvePostcode(obj: Record<string, unknown>): string | null {
  for (const k of ["postcode", "post_code", "postal_code", "zip", "zip_code"]) {
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}
