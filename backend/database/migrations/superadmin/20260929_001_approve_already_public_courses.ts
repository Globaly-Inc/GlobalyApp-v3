// Public course reads now require an admin-approved status (APPROVED_COURSE_STATUSES in
// src/modules/superadmin/consts.ts). Before that gate, every course of an exported job except a
// 'flagged' one was public, so without this backfill those live courses vanish from listings,
// counts and the AI counsellor the moment the gate deploys.
//
// Approves exactly what was already live AND reviewed: a promoted (exported) job, not flagged. 'mismatch' is left alone —
// it records a detected data problem, and confirming it here would erase that signal; such
// courses stay hidden until an admin reviews them.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    update superadmin.extraction_courses c
       set verification_status = 'confirmed', updated_at = now()
     where coalesce(c.verification_status, 'unverified') not in ('confirmed', 'manual', 'flagged', 'mismatch')
       and exists (select 1 from superadmin.extraction_jobs j where j.id = c.job_id and j.status = 'exported'
                   -- 20260924_001 relabelled these 'done' -> 'exported' without any course review, so
                   -- "exported" doesn't mean an admin vetted them. 'manual' (a Super Admin's own
                   -- institution) still needs approval; 'self_service' (business portal) skips it
                   -- at read time anyway, so confirming it here would only erase that it's unreviewed.
                   -- Databases that ran the broader version: scripts/revert-unreviewed-course-approvals.ts.
                   and j.source_type not in ('self_service', 'manual'))
  `);
}

// ponytail: irreversible — the prior status isn't kept. Un-approving would hide live courses
// again, which is what this migration exists to prevent.
export async function down(): Promise<void> {}
