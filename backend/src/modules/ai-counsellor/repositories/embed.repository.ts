import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
// A widget owner is a business or an institution — the same {kind, id} pair the enquiry lane
// already models for two-master-table ownership, so the helpers are reused rather than retyped.
import { recipientFilter, type Recipient } from "../../enquiries/shared/recipient.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("embed-repository");

export type EmbedOwner = Recipient;

export interface EmbedConfigRow {
  id: number;
  /** Exactly one of these is set — CHECK chk_ai_embed_configs_owner. */
  business_id: number | null;
  institution_id: number | null;
  embed_key: string;
  display_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  /** Launcher corner (20261001_002). Absent on a database behind that migration. */
  position?: "left" | "right";
  custom_instructions: string | null;
  /** Panel copy, editable after creation (20260928_001). Never reaches the model. */
  greeting: string | null;
  subtitle: string | null;
  monthly_credit_limit: number;
  credits_used_this_month: number;
  month_reset_at: Date;
  is_active: boolean;
  /** Learn counselling patterns from finished conversations on this widget (institution-memory). */
  auto_learn: boolean;
  created_at: Date;
  updated_at: Date;
}

const TABLE = "ai_embed_configs";

type Db = Knex | Knex.Transaction;

export interface EmbedConfigPatch {
  display_name?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  position?: "left" | "right";
  custom_instructions?: string | null;
  greeting?: string | null;
  subtitle?: string | null;
  monthly_credit_limit?: number;
  auto_learn?: boolean;
}

export async function create(owner: EmbedOwner, data: EmbedConfigPatch, db: Db = masterKnex): Promise<EmbedConfigRow> {
  const [row] = await db(TABLE)
    .insert({ ...recipientFilter(owner), ...data })
    .returning("*");
  return row;
}

export async function findByEmbedKey(embedKey: string): Promise<EmbedConfigRow | undefined> {
  return masterKnex(TABLE).where({ embed_key: embedKey }).first();
}

export async function findByOwner(owner: EmbedOwner): Promise<EmbedConfigRow[]> {
  return masterKnex(TABLE).where(recipientFilter(owner)).orderBy("created_at", "desc");
}

async function oldestActive(owner: EmbedOwner, db: Db = masterKnex): Promise<EmbedConfigRow | undefined> {
  return db(TABLE)
    .where(recipientFilter(owner)).where({ is_active: true })
    .orderBy([{ column: "created_at", order: "asc" }, { column: "id", order: "asc" }])
    .first() as Promise<EmbedConfigRow | undefined>;
}

/** The org's one widget for the portal card, minted on first ask.
 *
 *  OLDEST active, where `findByOwner` lists newest first: this resolves the key a customer may
 *  already have pasted into their site, so creating a second widget never silently points the card,
 *  the snippet email and the install at a key that is not on their page. */
export async function ensureForOwner(owner: EmbedOwner): Promise<EmbedConfigRow> {
  const existing = await oldestActive(owner);
  if (existing) return existing;
  return masterKnex.transaction(async (trx) => {
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`embed_mint:${owner.kind}:${owner.id}`]);
    return (await oldestActive(owner, trx)) ?? (await create(owner, {}, trx));
  });
}

/** Owner-scoped edit. Undefined = unchanged, null = cleared. */
export async function update(id: number, owner: EmbedOwner, patch: EmbedConfigPatch): Promise<EmbedConfigRow | undefined> {
  const [row] = await masterKnex(TABLE)
    .where({ id, ...recipientFilter(owner) })
    .update({ ...patch, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

/** New embed_key; every snippet carrying the old one stops resolving at once. */
export async function rotateKey(id: number, owner: EmbedOwner): Promise<EmbedConfigRow | undefined> {
  const [row] = await masterKnex(TABLE)
    .where({ id, ...recipientFilter(owner) })
    .update({ embed_key: masterKnex.raw("gen_random_uuid()"), updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deactivate(id: number, owner: EmbedOwner): Promise<number> {
  return masterKnex(TABLE)
    .where({ id, ...recipientFilter(owner) })
    .update({ is_active: false, updated_at: masterKnex.fn.now() });
}

export async function reactivate(id: number, owner: EmbedOwner): Promise<number> {
  return masterKnex(TABLE)
    .where({ id, ...recipientFilter(owner) })
    .update({ is_active: true, updated_at: masterKnex.fn.now() });
}

export async function incrementMonthlyUsage(id: number): Promise<void> {
  await masterKnex(TABLE)
    .where({ id })
    .update({ credits_used_this_month: masterKnex.raw("credits_used_this_month + 1") });
}

export async function resetMonthlyUsage(id: number): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({
    credits_used_this_month: 0,
    month_reset_at: masterKnex.raw("date_trunc('month', now()) + INTERVAL '1 month'"),
  });
}

/** Website of the config's owning business — the RAG scoping key for a business widget. */
export async function businessWebsite(businessId: number): Promise<string | null> {
  const row = await masterKnex("businesses").where({ id: businessId }).select("website").first();
  return row?.website ?? null;
}

/** Website of the config's owning institution — what its widget site index crawls. */
export async function institutionWebsite(institutionId: number): Promise<string | null> {
  const row = await masterKnex("institutions").where({ id: institutionId }).select("website").first();
  return row?.website ?? null;
}

/** Either owner kind's website, for the site index. */
export async function ownerWebsite(owner: EmbedOwner): Promise<string | null> {
  return owner.kind === "institution" ? institutionWebsite(owner.id) : businessWebsite(owner.id);
}

/**
 * The institution's own extraction job — the RAG scoping key for an institution widget.
 * `institutions.source_job_id` is unique and every institution has one (promote sets it for
 * admin-created listings, `mintSelfServiceJob` for self-registered), so the catalog is
 * addressable directly instead of via a website-domain match.
 */
export async function institutionSourceJobId(institutionId: number): Promise<string | null> {
  const row = await masterKnex("institutions")
    .where({ id: institutionId })
    .select("source_job_id")
    .first();
  return row?.source_job_id ?? null;
}

// ── Snippet recipients ──
// Everyone this TENANT has mailed the widget code to. The rows live in the tenant schema
// (migration 20261005_001, mirrored across business/ and institution/), so isolation is the
// CONNECTION the caller hands in — exactly like ai_widget_visitors. `db` is required for that
// reason: there is no masterKnex default, because masterKnex would read the wrong schema.
//
// Not teammates: no platform_user, no role, no invitation.

const DEVELOPERS = "ai_embed_developers";

/**
 * Postgres `undefined_table`. Matched on the code, never on the message: a tenant schema that
 * has not had 20261005_001 applied yet has no recipient list, which is migration lag, not a
 * failure of this request.
 *
 * Narrow on purpose. A blanket catch here would also swallow an undefined COLUMN, which is a
 * real bug — and the sibling `visitorService.attempt` has already cost us exactly that once: it
 * hid a parameter-type error while the card told the visitor their details were saved.
 */
const isMissingTable = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";

export interface EmbedDeveloperRow {
  id: number;
  /** App-level FK to globalyapp.ai_embed_configs.id — no real FK across schemas. */
  ai_embed_config_id: number;
  email: string;
  last_sent_at: Date | null;
  send_count: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Most recently sent to first — the card's list is "who has this code", newest at the top.
 *
 * A schema still missing the table reads as an empty list. The recipient list is one card on the
 * portal home; it is worth less than the page loading at all, and this read sits on
 * POST /embed/ensure, which every widget owner hits on arrival. Writes below do NOT degrade.
 */
export async function listDevelopers(db: Db, configId: number): Promise<EmbedDeveloperRow[]> {
  try {
    return await db(DEVELOPERS)
      .where({ ai_embed_config_id: configId })
      .orderBy([{ column: "last_sent_at", order: "desc", nulls: "last" }, { column: "id", order: "desc" }]);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    // Loud on purpose: an empty card looks like "nobody has the code yet", so the log is the
    // only place the real cause appears.
    logger.warn(`${DEVELOPERS} is missing from this tenant schema — run \`npm run migrate:tenants\``, {
      configId,
    });
    return [];
  }
}

/**
 * Record a send. Re-sending to the same address updates that row instead of adding a second —
 * the unique index on (config, email) is what makes the upsert safe under concurrent sends.
 */
export async function recordSend(db: Db, configId: number, email: string): Promise<EmbedDeveloperRow> {
  const [row] = await db(DEVELOPERS)
    .insert({ ai_embed_config_id: configId, email, last_sent_at: db.fn.now(), send_count: 1 })
    .onConflict(["ai_embed_config_id", "email"])
    .merge({ last_sent_at: db.fn.now(), send_count: db.raw(`${DEVELOPERS}.send_count + 1`), updated_at: db.fn.now() })
    .returning("*");
  return row;
}

/** Scoped by config as well as id: one tenant's schema can still hold rows for more than one
 *  widget, and an id alone would let a stale page delete the wrong list's row. */
export async function removeDeveloper(db: Db, configId: number, id: number): Promise<number> {
  return db(DEVELOPERS).where({ id, ai_embed_config_id: configId }).del();
}
