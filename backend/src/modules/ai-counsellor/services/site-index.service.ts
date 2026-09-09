// Indexing an institution's own website into the Knowledge Rack.
//
// The counsellor answers from structured extraction first (courses, fees, eligibility,
// the institution's own profile). Anything else the site says — scholarship terms, refund
// policy, student life, admissions prose — was never structurally extracted, so the owner's
// site is crawled into the rack under their own ownership and read back only by their
// widget. Reuses the existing crawl/chunk/embed pipeline rather than adding a second one.

import { masterKnex } from "../../../core/db/master-pool.js";
import { queueService } from "../../../shared/queue/queueService.js";
import { KNOWLEDGE_QUEUES } from "../../superadmin/ai-knowledge/shared/queues.js";
import { createChildLogger } from "../../../shared/logger.js";
import { assertPublicUrl, UnsafeUrlError } from "../../../shared/public-url.js";
import type { EmbedOwner } from "../repositories/embed.repository.js";

const logger = createChildLogger("site-index");

const S = "superadmin";
const SOURCES = `${S}.ai_knowledge_sources`;

// Enough to cover a university's public site without turning one widget install into an
// unbounded crawl. The rack's own recrawl dispatcher keeps it fresh from here.
const MAX_PAGES = 200;

/** Owner site indexes ride in their own category row — isolation comes from the owner
 *  column the match function filters on, not from the category, but a dedicated row keeps
 *  them out of the admin's curated "Institution updates" list. `kind` must stay inside
 *  rack.schema's enum, so it reuses institution_update. */
const CATEGORY = {
  slug: "embed-site-index",
  label: "Widget site indexes",
  kind: "institution_update",
  description: "Websites crawled for an institution's own embed widget. Not global knowledge.",
} as const;

/**
 * The category row for site indexes, created on first use.
 *
 * Created rather than looked up: nothing seeds categories, so depending on one having been
 * provisioned by hand meant every widget creation in a fresh environment logged a warning
 * and silently skipped indexing — the feature would simply never switch on.
 */
async function siteIndexCategoryId(): Promise<string> {
  const existing = await masterKnex(`${S}.ai_knowledge_categories`).where({ slug: CATEGORY.slug }).first();
  if (existing) return existing.id;

  const [row] = await masterKnex(`${S}.ai_knowledge_categories`)
    .insert({ ...CATEGORY, active: true, sort_order: 999 })
    .onConflict("slug")            // two widget creations racing the first insert
    .merge({ active: true })
    .returning("id");
  return row.id;
}

/**
 * Register the owner's website as their private rack source and queue a crawl.
 *
 * Idempotent: re-running for the same owner and URL re-queues the existing source rather
 * than duplicating it, so calling this on every widget create is safe. Returns null when
 * there is nothing to index — no website on file, or an unparseable one — because a widget
 * with no site index still works, it just answers from structured data alone.
 */
export async function ensureOwnerSiteIndex(
  owner: EmbedOwner,
  website: string | null | undefined,
): Promise<{ sourceId: string; queued: boolean } | null> {
  // Institutions only: `ai_knowledge_sources.business_id` is a uuid while `businesses.id`
  // is an integer, so there is no usable business owner column to scope a business site
  // index by. Businesses keep answering from their matched extraction jobs.
  if (owner.kind !== "institution") return null;
  if (!website) return null;

  let url: string;
  let domain: string;
  try {
    // SSRF gate. The institution website field is a free-text string (institution-profile
    // .schema.ts has no .url()), and whatever lands here is fetched BY THE SERVER and then
    // served back to this same institution through its widget. Without this an institution
    // member could point it at the cloud metadata endpoint and read the credentials out of
    // their own chat panel.
    const parsed = await assertPublicUrl(website);
    // Crawl from the site root: a website field pointing at /about would otherwise
    // bound the crawl to that one branch.
    url = parsed.origin;
    domain = parsed.hostname.replace(/^www\./, "");
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      logger.warn("Refusing to index an unsafe website", { institutionId: owner.id, website, reason: err.message });
      return null;
    }
    throw err;
  }

  const categoryId = await siteIndexCategoryId();

  // Look up on the columns the DATABASE makes unique — (category_id, url) — not on
  // (institution_id, url). Two institution records can share one website: this database
  // has three rows on www.curtin.edu.au and three on www.ibm.vic.edu.au. Keying the
  // lookup on the owner meant the second one's insert hit the unique index and its site
  // index was silently dropped.
  const existing = await masterKnex(SOURCES)
    .where({ category_id: categoryId, url, institution_id: owner.id })
    .first();

  const source = existing
    ? existing
    : await masterKnex(SOURCES)
      .insert({
        category_id: categoryId,
        url,
        domain,
        title: `${domain} (widget site)`,
        // The owner's own site is authoritative about the owner, which is all this
        // source is ever read for.
        trust_tier: "official",
        source_type: "url",
        crawl_frequency: "monthly",
        max_pages: MAX_PAGES,
        active: true,
        added_via: "embed_widget",
        institution_id: owner.id,
      })
      .returning("*")
      .then(([row]) => row);

  try {
    await queueService.publish(KNOWLEDGE_QUEUES.CRAWL, { sourceId: source.id, maxPages: MAX_PAGES });
    await masterKnex(SOURCES).where({ id: source.id }).update({ last_status: "queued", last_error: null });
    logger.info("Queued owner site crawl", { sourceId: source.id, domain, owner });
    return { sourceId: source.id, queued: true };
  } catch (err) {
    // The source row is what matters — a dead queue must not fail widget creation, and
    // the recrawl dispatcher will pick the source up on its next pass.
    logger.warn("Owner site crawl not queued", { sourceId: source.id, err: String(err) });
    return { sourceId: source.id, queued: false };
  }
}
