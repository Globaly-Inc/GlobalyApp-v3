// mintSelfServiceJob (platform-users.service.ts) and mintManualInstitutionJob
// (superadmin/platform/businesses/services/businesses.service.ts) both used to stamp status
// "done" instead of "exported" — the public/preview course visibility check
// (search/repositories/courses.repository.ts's PUBLICLY_VISIBLE) requires status = 'exported',
// so every self-registered or admin-manually-created institution's courses were unreachable —
// including the owner's own "Preview" button, which 404s the same way. Both mint sites (and the
// business-services.service.ts self-heal path) now stamp "exported" going forward; this
// backfills jobs already minted the old way.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex("extraction_jobs")
    .where({ status: "done" })
    .whereIn("source_type", ["self_service", "manual"])
    .update({ status: "exported" });
}

export async function down(): Promise<void> {
  // Not reversible to "done" specifically — that would require knowing which exported rows were
  // never actually reviewed, which this migration has no way to recover.
}
