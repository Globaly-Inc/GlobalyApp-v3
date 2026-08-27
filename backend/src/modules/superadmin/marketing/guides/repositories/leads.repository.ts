import { masterKnex } from "../../../../../core/db/master-pool.js";

const TABLE = "superadmin.guide_leads";
const GUIDES_TABLE = "superadmin.guides";

/**
 * Insert a lead, or — on the (guide_id, email) unique conflict — reset it for resend:
 * refresh the name and clear `email_sent_at` so the sweep worker treats it as unsent again.
 * One atomic upsert instead of check-then-write avoids a race between two submissions of the
 * same email arriving at once.
 */
export async function upsertLead(guideId: number, name: string, email: string) {
  const [row] = await masterKnex(TABLE)
    .insert({ guide_id: guideId, name, email })
    .onConflict(["guide_id", "email"])
    .merge({ name, email_sent_at: null, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

// ─── Worker (guide-email.worker.ts) ───────────────────────────────────────────────────────

/** Oldest unsent leads first, joined to the guide for its title/slug/pdf path. */
export async function claimUnsentBatch(limit: number) {
  return masterKnex(`${TABLE} as l`)
    .join(`${GUIDES_TABLE} as g`, "g.id", "l.guide_id")
    .whereNull("l.email_sent_at")
    .orderBy("l.created_at", "asc")
    .limit(limit)
    .select(
      "l.id",
      "l.name",
      "l.email",
      "g.title as guide_title",
      "g.slug as guide_slug",
      "g.pdf_url as guide_pdf_url",
    );
}

export async function markEmailSent(id: number) {
  return masterKnex(TABLE).where({ id }).update({ email_sent_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() });
}
