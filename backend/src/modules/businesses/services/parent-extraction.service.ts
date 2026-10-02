// A branch created with "same website as the parent" would re-crawl the exact site its head office
// already extracted — and createJob refuses a second job for the same host anyway. Such a branch
// instead reads its head office's extraction: status/counts, the onboarding step, and no
// "Start extraction" form. A branch with its own website (or none) extracts on its own as before.

import { masterKnex } from "../../../core/db/master-pool.js";
import * as jobsRepo from "../../superadmin/data-extraction/repositories/jobs.repository.js";

type OrgTable = "businesses" | "institutions";

const host = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/** The head office's real extraction job when this branch shares its website, else null. */
export async function parentExtraction(
  table: OrgTable,
  org: { website?: string | null; parent_business_id?: number | null; parent_institution_id?: number | null },
): Promise<{ jobId: string; parentName: string } | null> {
  const parentId = table === "businesses" ? org.parent_business_id : org.parent_institution_id;
  const mine = host(org.website);
  if (parentId == null || !mine) return null;
  const nameCol = table === "businesses" ? "business_name" : "institution_name";
  const parent = await masterKnex(table).where({ id: parentId }).whereNull("deleted_at")
    .first("website", "source_job_id", `${nameCol} as name`);
  if (!parent?.source_job_id || host(parent.website) !== mine) return null;
  // The auto-minted "self_service" placeholder is not a real extraction (see withPublicSourceJobId).
  if ((await jobsRepo.findJobSourceType(parent.source_job_id)) === "self_service") return null;
  return { jobId: parent.source_job_id, parentName: parent.name };
}

