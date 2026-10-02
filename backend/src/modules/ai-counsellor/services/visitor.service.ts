// The anonymous widget visitor — created on their first message, carried through the
// conversation, and promoted to a named contact if they ever share their details.
//
// The row lives in the OWNING TENANT'S schema (ai_widget_visitors), not in globalyapp where
// the conversation itself lives. That split is the reason this file exists: the embed routes
// are public by construction (publicAiCounsellorModule is registered outside the auth scope
// in server.ts), so `req.db` is never set and the tenant connection has to be resolved from
// the widget's own owner instead of from the request.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { EmbedConfigRow } from "../repositories/embed.repository.js";
import { PROFILE_KEYS, PROFILE_SCALAR_COLUMNS, type ProfileKey, type VisitorProfile } from "../lib/card-parser.js";

const logger = createChildLogger("widget-visitor");

const TABLE = "ai_widget_visitors";

export type ContactStatus = "not_shown" | "shown" | "skipped" | "submitted";
/** How we came to hold this visitor's details: the card, or their own words (20261001_002). */
export type ContactSource = "card" | "volunteered";
/** Derived by Postgres from whether the visitor ever left their details — see VisitorRow.status. */
export type VisitorStatus = "visitor" | "lead";
export type SummaryStatus = "pending" | "processing" | "sent" | "failed";
export type ConversationState = "active" | "ending_prompt_shown" | "continue" | "end_confirmed";

/** Which offer, if any, this turn should carry. */
export type PromptKind = "contact" | "ending";

export interface VisitorRow {
  id: number;
  visitor_key: string;
  embed_config_id: number;
  session_id: number | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  /**
   * Null until we hold something. `chk_ai_widget_visitors_contact_pair` is GONE (20261001_002):
   * a visitor who only said "I'm John" has given us a real name and no address, and the halves
   * are independently nullable now. `status` still derives from `email`, so a name alone keeps
   * them a Visitor.
   */
  contact_source: ContactSource | null;
  /**
   * Read-only. A GENERATED ALWAYS column (20260923_001) that Postgres derives from `email`, so
   * it appears in every `returning("*")` here but must never be written — an INSERT or UPDATE
   * naming it is an error, not a silent no-op. Handing over a name and email is what promotes
   * a visitor to a lead, and that is the only way it moves.
   */
  status: VisitorStatus;
  contact_status: ContactStatus;
  contact_prompt_count: number;
  contact_prompted_at_count: number | null;
  contact_prompted_at: Date | null;
  contact_submitted_at: Date | null;
  /**
   * message_count at the moment they handed over their details (20261001_004).
   *
   * Captured here because it cannot be recovered afterwards: message_count keeps climbing as the
   * visitor carries on asking things, so reading it at conversation end would count every later
   * message as effort spent winning the lead.
   */
  contact_submitted_at_count: number | null;
  message_count: number;
  first_seen_at: Date;
  last_activity_at: Date;
  conversation_state: ConversationState;
  end_prompt_count: number;
  end_prompt_at_count: number | null;
  end_confirmed_at: Date | null;
  /**
   * Self-reported background, extracted from the conversation by the counsellor. Field names
   * mirror the platform_user_* tables exactly. Null means never raised; [] would mean asked and
   * none, which is why the default is null.
   *
   * NOT a record — a model's reading of a stranger's prose. Never gate eligibility on it.
   */
  qualifications: VisitorProfile["qualifications"] | null;
  language_tests: VisitorProfile["language_tests"] | null;
  academic_tests: VisitorProfile["academic_tests"] | null;
  work_experiences: VisitorProfile["work_experiences"] | null;
  /**
   * Scalar attributes, same provenance and the same warning as the arrays above: stated by the
   * visitor, read out of prose by a model, never inferred from a name, a language or a location.
   *
   * `age` is VERBATIM ("22", "early 30s") — there is no configured age-group list on this
   * platform to bucket into. `nationality` is resolved to a globalyapp.countries name;
   * `nationality_raw` holds the visitor's own wording, and only when it differs or matched no
   * country. `study_preference` is the ONE course being discussed, never a concatenation.
   */
  age: string | null;
  gender: string | null;
  nationality: string | null;
  nationality_raw: string | null;
  study_preference: string | null;
  /**
   * Server-observed details with no column of their own — where the widget was embedded, the
   * referrer, campaign parameters, locale. Always an object (CHECK), so no null handling.
   *
   * NOT a second home for model output. The four jsonb columns above are what the extractor
   * writes, through cleanProfile; nothing read out of the conversation belongs in here. See
   * 20261001_002 for why that line is drawn in the migration and not left to taste.
   */
  meta: Record<string, unknown>;
  summary_status: SummaryStatus | null;
  summary_attempts: number;
  summary_sent_at: Date | null;
  summary_error: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * The tenant schema that owns this widget, as a Knex bound to it.
 *
 * Pool keys match tenant.plugin exactly — `businesses.id` for a business, `schema_name` for
 * an institution. Keying both on the schema uuid would look tidier and would quietly double
 * the number of pools a busy business holds, because the plugin's entry for the same schema
 * lives under a different key.
 *
 * Returns null rather than throwing when the owner has no provisioned schema: a promoted
 * listing nobody has claimed can still own an embed config row, and a visitor chatting to it
 * should get their answer, not a 500.
 */
export async function tenantDbFor(config: EmbedConfigRow): Promise<Knex | null> {
  if (config.institution_id != null) {
    const row = await masterKnex("institutions")
      .where({ id: config.institution_id })
      .whereNotNull("schema_provisioned_at")
      .first("schema_name");
    if (!row?.schema_name) return null;
    return getKnex(row.schema_name, schemaName(row.schema_name));
  }

  if (config.business_id != null) {
    const row = await masterKnex("businesses")
      .where({ id: config.business_id })
      .whereNotNull("schema_provisioned_at")
      .first("id", "schema_name");
    if (!row?.schema_name) return null;
    return getKnex(row.id, schemaName(row.schema_name));
  }

  return null;
}

/**
 * The visitor's row, created on first sight.
 *
 * Find-then-insert with race recovery rather than an upsert, mirroring
 * guestService.resolveVisitorSession: two tabs opened at once both miss the SELECT, and the
 * unique index is what settles it. The loser re-reads instead of failing the message.
 */
export async function resolveVisitor(
  db: Knex,
  opts: { visitorKey: string; embedConfigId: number; sessionId: number | null },
): Promise<VisitorRow> {
  const where = { visitor_key: opts.visitorKey, embed_config_id: opts.embedConfigId };

  const existing = await db<VisitorRow>(TABLE).where(where).first();
  if (existing) return existing;

  try {
    const [row] = await db<VisitorRow>(TABLE)
      .insert({ ...where, session_id: opts.sessionId })
      .returning("*");
    return row;
  } catch (err) {
    const raced = await db<VisitorRow>(TABLE).where(where).first();
    if (raced) return raced;
    throw err;
  }
}

/**
 * When the contact card lands, as a spread rather than one fixed message number.
 *
 * The product rule: first ask around messages 3-5, then every 5-10 messages after a decline.
 * The step up from 3-5 to 5-10 happens ONCE, between the first ask and the rest — the gap does
 * not keep widening, it just stays in that range. What bounds the total is the length of the
 * conversation, not a maximum: at 5-10 apart, a typical 15-message widget chat carries two asks,
 * and only a 40-message one reaches five. There is no explicit cap to maintain.
 *
 * Constants rather than the per-widget columns these replaced: no institution ever asked for a
 * different number, and there is no PATCH endpoint for widget settings, so those columns could
 * only ever have been changed by hand-written SQL anyway.
 */
/**
 * The contact-card schedule, and whether to run it at all.
 *
 * These were plain constants with a note that no institution had ever asked for different
 * numbers. The Rack's collection rules now expose exactly this (CollectionSchema.contact_ask),
 * so the constants became the DEFAULT rather than the rule — and until this parameter existed,
 * an institution could switch "offer to email a summary" off in the portal, see the prompt stop
 * asking in prose, and still watch the card appear on message four.
 */
export interface ContactAskRules {
  enabled: boolean;
  /** Absolute message number for the first ask, as [min, max]. */
  first_at: readonly [number, number];
  /** Message gap before every later ask, as [min, max]. */
  gap: readonly [number, number];
}

/** Absolute message number for the first ask. */
const FIRST_ASK_AT = { min: 3, max: 5 } as const;
/**
 * GAP before EVERY subsequent ask — not just the second one. Different units from the constant
 * above, which is why they are named differently: 3-5 is a position, 5-10 is a distance. Each
 * successive ask draws its own gap from this range (see `round` in askAt), so a visitor who keeps
 * ignoring the card is asked roughly every 5-10 messages rather than on a fixed cadence.
 */
const RE_ASK_GAP = { min: 5, max: 10 } as const;

/** What every caller got before the Rack existed, and what a caller that passes nothing gets. */
export const DEFAULT_CONTACT_ASK: ContactAskRules = {
  enabled: true,
  first_at: [FIRST_ASK_AT.min, FIRST_ASK_AT.max],
  gap: [RE_ASK_GAP.min, RE_ASK_GAP.max],
};

const range = (pair: readonly [number, number]) => ({ min: pair[0], max: pair[1] });

/**
 * A stable number in [min, max] for this visitor and this round.
 *
 * Derived from the visitor's own key, NOT `Math.random()`, and that is the whole point. A fresh
 * roll on every turn would move the goalpost underneath a visitor mid-conversation — the card
 * due at 4 on one turn and 5 on the next — and it would make `shouldPrompt` non-deterministic,
 * which is the property its entire test suite rests on. Hashing gives the spread ACROSS visitors
 * that randomising was wanted for, while any one visitor keeps the same schedule for the life of
 * their row.
 *
 * FNV-1a because this picks a number between 3 and 10: distribution is all that matters and
 * nothing here is a secret. `round` is what makes each successive ask its own independent draw —
 * pass the number of times this visitor has already been asked.
 */
function askAt(visitorKey: string, round: number, range: { min: number; max: number }): number {
  let h = 0x811c9dc5;
  const seed = `${visitorKey}:${round}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Span floored at 1. The schema rejects a reversed range, but this is the arithmetic that
  // turns one into NaN — and a NaN threshold is never reached, so the card goes quiet with
  // nothing logged. A value that reaches here by any other route (hand-written SQL, a future
  // caller that skips zod) degrades to "always the min" instead of "never".
  const span = Math.max(1, range.max - range.min + 1);
  return range.min + (Math.abs(h) % span);
}

/**
 * Has the gap since this visitor's last declined card elapsed?
 *
 * Shared by the count rule and by the conclusion-brought-forward branch in `decidePrompt` so the
 * two cannot drift apart — they did once before, and the result was a card that reappeared on
 * the turn after it was dismissed.
 */
function contactCooledDown(
  visitor: Pick<VisitorRow, "visitor_key" | "contact_prompted_at_count" | "contact_prompt_count">,
  nextCount: number,
  rules: ContactAskRules = DEFAULT_CONTACT_ASK,
): boolean {
  const last = visitor.contact_prompted_at_count;
  if (last == null) return true;
  const round = visitor.contact_prompt_count ?? 0;
  return nextCount - last >= askAt(visitor.visitor_key, round, range(rules.gap));
}

/**
 * Should we ask this visitor for their details on this turn?
 *
 * Pure and exported so the rule can be tested without a database — it is the one piece of
 * this feature with enough branches to get quietly wrong.
 *
 * `nextCount` is the count this turn will BRING the visitor to, not the stored one. The
 * decision has to be made before the answer is streamed (writeDone closes the socket before
 * the turn is persisted), so the stored count is always one behind at the point we ask.
 */
export function shouldPrompt(
  visitor: Pick<
    VisitorRow,
    "visitor_key" | "contact_status" | "contact_prompted_at_count" | "contact_prompt_count"
  >,
  nextCount: number,
  rules: ContactAskRules = DEFAULT_CONTACT_ASK,
): boolean {
  // The institution turned the card off. The prompt is told the same thing, but the card is
  // drawn from here, so saying it in only one of the two places is how the two disagree.
  if (!rules.enabled) return false;

  // They gave us their details. Never ask again, in this conversation or any later one.
  if (visitor.contact_status === "submitted") return false;

  if (visitor.contact_status === "not_shown") {
    return nextCount >= askAt(visitor.visitor_key, 0, range(rules.first_at));
  }

  // "shown" and "skipped" are treated alike on purpose. A card the visitor ignored and one
  // they actively dismissed are the same signal — not now — and both have to wait out the
  // same gap, or ignoring the card would re-trigger it on the very next message.
  return contactCooledDown(visitor, nextCount);
}

/**
 * A summary that is already in flight or finished, so there is nothing left to offer.
 *
 * `pending` is deliberately NOT in here. Since the delivery fallback came back, `pending` means
 * "owed eventually" — it is set the moment a visitor hands over their email — so treating it as
 * settled would silence the end-of-chat offer for every visitor who ever gave an address, which
 * is precisely the set of people the offer is for. Confirming is how they get it sooner.
 */
function summarySettled(status: SummaryStatus | null | undefined): boolean {
  // `!= null` on purpose, not `!== null`. The column is absent from the row whenever the tenant
  // schema has not taken the migration yet, which makes this `undefined` rather than null — and
  // a strict check read that as "already sent", silently disabling the whole end-of-chat offer
  // with no error anywhere. Unknown means unknown, not settled.
  return status != null && status !== "pending";
}

/**
 * Is a conclusion signal worth asking the model for on this turn?
 *
 * Lives here rather than inline in the route so it can be tested against `decidePrompt`, which
 * is how the one bug this pair has had was found: the gate additionally required an email,
 * which made `decidePrompt`'s "concluded but no address yet" branch unreachable in production
 * while its unit test — calling decidePrompt directly with `concluded: true` — passed happily.
 *
 * The invariant the tests assert: if `decidePrompt(v, …, true)` can return anything, then
 * `shouldDetectConclusion(v)` must be true. Otherwise we are deciding on a signal we never
 * asked for.
 *
 * NOTE: nothing in src/ calls this any more. The route spends a judgement call only when
 * `decidePrompt(v, n, true) !== decidePrompt(v, n, false)`, which is exactly this predicate and
 * then some — it also stops asking once the one-per-visitor offer is spent. This is kept because
 * the suite uses it to prove the property that gate depends on: with this shut, decidePrompt
 * ignores `concluded` entirely, so the two-way comparison can never ask for a judgement that
 * could not act. Delete it only together with that test.
 */
export function shouldDetectConclusion(
  visitor: Pick<VisitorRow, "summary_status" | "conversation_state">,
): boolean {
  return !summarySettled(visitor.summary_status) && visitor.conversation_state !== "end_confirmed";
}

/**
 * Which offer this turn carries — the contact card, the end-of-chat offer, or neither.
 *
 * The one place the two prompts are arbitrated, so they can never both appear: two cards in one
 * turn asking for two different commitments is the pop-up experience this whole feature avoids.
 *
 * `concluded` is the counsellor's judgement, not a rule. It is the only input a message count
 * cannot express — "their question got answered" — which is why it comes from the model. Every
 * other condition here is the product rule, which is why it does not.
 */
export function decidePrompt(
  visitor: Pick<
    VisitorRow,
    "visitor_key" | "contact_status" | "contact_prompted_at_count" | "contact_prompt_count"
      | "email" | "conversation_state" | "end_prompt_count" | "summary_status"
  >,
  nextCount: number,
  concluded: boolean,
  rules: ContactAskRules = DEFAULT_CONTACT_ASK,
): PromptKind | null {
  // Already sent, sending, or failed. Offering again would duplicate it or promise a second one
  // we will not send. `pending` is fine to offer over — see summarySettled.
  if (summarySettled(visitor.summary_status)) return null;

  // One state check for BOTH conclusion branches, not one inside each. Guarding only the
  // with-an-email branch left a visitor who ended the chat without giving an address being
  // asked for one afterwards — a card offering to email a summary of a conversation that is
  // already over. Ended and not yet reopened by a new message (recordTurn resets this to
  // 'active') means there is nothing left to offer.
  if (concluded && visitor.conversation_state !== "end_confirmed") {
    if (visitor.email) {
      // Offered once, then never again. This replaced a message-gap cooldown, and it is a
      // better rule than the one it replaced: the visitor said "keep going", and re-asking six
      // messages later is the nagging this whole feature exists to avoid. What made the
      // cooldown necessary was that declining used to be the only way to lose the summary —
      // now the 30-minute fallback sends one to everyone who gave an address, so declining the
      // card costs them nothing and there is nothing to keep offering.
      //
      // `?? 0` for the same reason as summarySettled: a schema that has not taken the
      // migration returns the column ABSENT, so a strict `=== 0` reads undefined as "already
      // offered" and silently disables the whole card. Unknown must fail towards offering.
      return (visitor.end_prompt_count ?? 0) === 0 ? "ending" : null;
    }

    // No address to send to. This is the best moment there will ever be to ask for one, so a
    // conclusion satisfies the "enough turns have passed" threshold on its own and brings the
    // contact card forward. A visitor who only just declined still gets their cooldown —
    // being at a natural ending does not make a second ask any less of a second ask.
    // `rules.enabled` guards this branch too, not only shouldPrompt below: a natural ending is
    // the one place the card is brought FORWARD, so an institution that switched the card off
    // would otherwise still meet it exactly once, at the end of every conversation.
    if (rules.enabled && visitor.contact_status !== "submitted") {
      return contactCooledDown(visitor, nextCount, rules) ? "contact" : null;
    }
  }

  return shouldPrompt(visitor, nextCount, rules) ? "contact" : null;
}

/**
 * One turn's worth of bookkeeping: the visitor is one message further in and active now.
 *
 * A new message reopens an ended conversation. `end_confirmed` → `active` so the counsellor can
 * offer again later, while `summary_status` is deliberately left alone — the summary they already
 * asked for is owed exactly once, and the dedup key enforces that whatever the state says.
 */
export async function recordTurn(
  db: Knex,
  visitorId: number,
  opts: { prompted: PromptKind | null; nextCount: number; sessionId: number | null },
): Promise<void> {
  await db(TABLE)
    .where({ id: visitorId })
    .update({
      // Incremented in SQL, not written as the absolute value the route computed. The same
      // visitor_key can have two tabs open: both read message_count = 5, both derive
      // nextCount = 6, and an absolute write means one of those turns never happened as far as
      // the schedule is concerned. Postgres evaluates every SET expression against the OLD row,
      // so the prompt-count snapshots below stay consistent with this.
      message_count: db.raw("message_count + 1"),
      // The only clock the fallback runs on, now that the leave beacon is gone: a new message
      // pushes the 30 minutes out, which is the whole of "they came back".
      last_activity_at: db.fn.now(),
      session_id: opts.sessionId,
      updated_at: db.fn.now(),
      // Typing on past an unanswered offer is itself an answer — 'continue' — and the visitor
      // should not find the same card waiting on the next turn.
      conversation_state: db.raw(
        `CASE
           WHEN ? THEN 'ending_prompt_shown'
           WHEN conversation_state IN ('ending_prompt_shown','end_confirmed') THEN 'active'
           ELSE conversation_state
         END`,
        [opts.prompted === "ending"],
      ),
      ...(opts.prompted === "ending"
        ? {
            end_prompt_count: db.raw("end_prompt_count + 1"),
            end_prompt_at_count: db.raw("message_count + 1"),
          }
        : {}),
      ...(opts.prompted === "contact"
        ? {
            // Left at 'submitted' if it somehow already is — a prompt racing a submission
            // must not walk the status backwards and start asking again.
            contact_status: db.raw(
              `CASE WHEN contact_status = 'submitted' THEN contact_status ELSE 'shown' END`,
            ),
            contact_prompt_count: db.raw("contact_prompt_count + 1"),
            contact_prompted_at_count: db.raw("message_count + 1"),
            contact_prompted_at: db.fn.now(),
          }
        : {}),
    });
}

/**
 * What identifies "the same" entry across turns, so a restatement updates rather than duplicates.
 *
 * A visitor says "I have IELTS 7" on message 3 and "my IELTS was 7, taken in June" on message 9.
 * Without a key those are two rows; with one they are the same test, the second filling in the
 * date. Deliberately loose — lowercased, missing parts allowed — because the model's phrasing
 * varies and a strict key just means duplicates.
 */
function profileKey(key: ProfileKey, entry: Record<string, unknown>): string {
  const part = (f: string) => String(entry[f] ?? "").trim().toLowerCase();
  if (key === "qualifications") return `${part("degree_title")}|${part("institution_name")}`;
  if (key === "work_experiences") return `${part("job_title")}|${part("organization_name")}`;
  return part("test_type"); // both test tables: one row per test type
}

/**
 * Merge this turn's profile block into what the row already holds.
 *
 * Read-modify-write rather than a jsonb `||` in SQL: the merge is per-ENTRY, not per-column, so
 * it needs the dedupe key above, and expressing that in SQL would be a page of jsonb_array_elements
 * for no gain on a table this size.
 *
 * Deliberately NOT folded into recordTurn. Adding a column to that UPDATE is precisely what broke
 * both cards a week ago: one statement, so a tenant schema missing the column fails the whole
 * write and freezes message_count. A separate best-effort statement can fail alone.
 */
export async function recordProfile(
  db: Knex,
  visitorId: number,
  incoming: VisitorProfile,
): Promise<void> {
  // Read and write under a row lock. This is a read-modify-write over whole jsonb arrays, so two
  // turns landing together would otherwise both read the same `existing`, each merge their own
  // entry onto it, and the second write would drop the first visitor's fact for good. The lock
  // is cheap here — one row, and the merge between the SELECT and the UPDATE is pure CPU.
  await db.transaction(async (trx) => {
    const existing = await trx<VisitorRow>(TABLE)
      .where({ id: visitorId })
      .forUpdate()
      .first("qualifications", "language_tests", "academic_tests", "work_experiences");
    if (!existing) return;

    const patch: Record<string, unknown> = {};

    // Scalars: written when this turn supplied one, left alone when it did not. That asymmetry is
    // the requirement — a later message that simply does not mention nationality must not erase
    // the nationality an earlier one gave, while a visitor CORRECTING themselves must win. Both
    // fall out of "only keys the extraction returned reach the patch", since the extractor omits
    // whatever the conversation did not state.
    for (const key of PROFILE_SCALAR_COLUMNS) {
      const value = incoming[key];
      if (typeof value === "string" && value) patch[key] = value;
    }
    // Except the nationality pair, which is one statement stored in two columns: a turn that
    // supplied either half replaces both. Otherwise "Nepali" then "actually, Kashmiri" keeps
    // Nepal beside the new wording, and "Nepali" then "I'm from India" keeps "Nepali" as the raw.
    if ("nationality" in patch || "nationality_raw" in patch) {
      patch.nationality ??= null;
      patch.nationality_raw ??= null;
    }

    for (const key of PROFILE_KEYS) {
      const add = incoming[key];
      if (!add?.length) continue;

      // A column absent on a lagging schema reads as undefined; an array that is somehow not an
      // array would break the merge, so both fall back to empty rather than throwing.
      const current = existing[key];
      const merged = new Map<string, Record<string, unknown>>();
      for (const e of Array.isArray(current) ? current : []) {
        merged.set(profileKey(key, e as Record<string, unknown>), e as Record<string, unknown>);
      }
      for (const e of add as Record<string, unknown>[]) {
        const k = profileKey(key, e);
        // Shallow-merge onto what is there: the new mention wins field by field, so a later turn
        // adding a test date does not wipe the score the earlier one carried.
        merged.set(k, { ...(merged.get(k) ?? {}), ...e });
      }
      patch[key] = JSON.stringify([...merged.values()]);
    }

    if (!Object.keys(patch).length) return;
    await trx(TABLE).where({ id: visitorId }).update({ ...patch, updated_at: trx.fn.now() });
  });
}

/**
 * The visitor's answer to the end-of-chat offer.
 *
 * `end` is the ONLY thing that arms a summary email. There is no timer and no leave beacon any
 * more: an email inferred from silence arrived as though the visitor had finished when they had
 * only stepped away, so nothing but an explicit yes will send one now.
 *
 * Arming requires an address. A confirmed ending with no email still records the state — the
 * conversation really did end — it just has nowhere to send anything.
 */
export async function recordConversationEnd(
  db: Knex,
  opts: { visitorKey: string; embedConfigId: number; action: "end" | "continue" },
): Promise<VisitorRow | undefined> {
  const where = { visitor_key: opts.visitorKey, embed_config_id: opts.embedConfigId };

  if (opts.action === "continue") {
    const [row] = await db<VisitorRow>(TABLE)
      .where(where)
      .update({
        conversation_state: "continue",
        // Restart the cooldown from the decision, not from whenever the card was drawn.
        end_prompt_at_count: db.raw("message_count"),
        updated_at: db.fn.now(),
      })
      .returning("*");
    return row;
  }

  const [row] = await db<VisitorRow>(TABLE)
    .where(where)
    // Idempotent: a double-clicked button cannot disturb a summary already being sent. A
    // `pending` row is fine to confirm over — that is the whole point, it makes it due now.
    .where((q) => q.whereNull("summary_status").orWhere({ summary_status: "pending" }))
    .update({
      conversation_state: "end_confirmed",
      end_confirmed_at: db.fn.now(),
      summary_status: db.raw("CASE WHEN email IS NOT NULL THEN 'pending' ELSE NULL END"),
      updated_at: db.fn.now(),
    })
    .returning("*");
  return row;
}

/**
 * The visitor answered the card — either way.
 *
 * Submitting is idempotent and one-way: a second submission for an already-submitted visitor
 * updates nothing, so a double-clicked button cannot re-arm a summary that has already been
 * sent. Skipping an already-submitted visitor is likewise ignored.
 */
export async function recordContact(
  db: Knex,
  opts: {
    visitorKey: string;
    embedConfigId: number;
    action: "submit" | "skip";
    name?: string;
    email?: string;
  },
): Promise<VisitorRow | undefined> {
  const where = { visitor_key: opts.visitorKey, embed_config_id: opts.embedConfigId };

  if (opts.action === "skip") {
    const [row] = await db<VisitorRow>(TABLE)
      .where(where)
      .whereNot({ contact_status: "submitted" })
      .update({
        contact_status: "skipped",
        // Restart the cooldown from here, not from whenever the card happened to be drawn.
        contact_prompted_at_count: db.raw("message_count"),
        updated_at: db.fn.now(),
      })
      .returning("*");
    return row;
  }

  const [row] = await db<VisitorRow>(TABLE)
    .where(where)
    .whereNot({ contact_status: "submitted" })
    .update({
      name: opts.name ?? null,
      email: opts.email ?? null,
      contact_source: "card",
      contact_status: "submitted",
      contact_submitted_at: db.fn.now(),
      // The card is answered in its own request, after the turn that prompted it was recorded,
      // so the stored count is already current — no +1 here, unlike the volunteered path.
      contact_submitted_at_count: db.raw("message_count"),
      // Arms the summary as OWED, not as due. The card promised them one, so from here it is
      // going to be sent; confirming the end of the chat just makes it due immediately, and
      // the idle/close fallback covers everyone who never presses the button.
      //
      // Conditional on an address since 20261001_002 dropped the pair constraint. The card
      // always sends both, so this is a no-op here — it is stated because the constraint that
      // used to guarantee it is gone, and the summary worker has nowhere to send without one.
      summary_status: db.raw("CASE WHEN ? IS NOT NULL THEN 'pending' ELSE summary_status END", [opts.email ?? null]),
      updated_at: db.fn.now(),
    })
    .returning("*");
  return row;
}

/**
 * Best-effort wrapper for everything above.
 *
 * Lead capture is worth less than the widget answering at all: a tenant schema that is
 * unreachable, un-migrated, or mid-provision must cost the visitor their contact record, not
 * their reply. Every call site in the streaming path goes through this.
 */
export async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`Widget visitor: ${label} failed`, {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Details the visitor gave in conversation rather than in the card.
 *
 * Why this is not just `recordContact({ action: "submit" })`:
 *
 *   - An EMAIL is the whole transaction. It promotes them to a lead, settles the contact card
 *     for good, and arms the summary they are now owed — so it takes the full submit path.
 *   - A NAME alone is not. It is worth storing (greeting someone by name costs nothing and
 *     reads as having listened), but it answers none of the card's question, so
 *     `contact_status` is left exactly where it was and the card may still ask later — with
 *     their name already known.
 *
 * Never overwrites what the card captured: a visitor who typed their details in has confirmed
 * them, and a model reading a different address out of a later sentence must not replace that.
 * The same guard makes this idempotent across turns, since the extractor re-reads a message it
 * has already seen whenever the visitor restates something.
 */
export async function recordVolunteeredContact(
  db: Knex,
  opts: { visitorKey: string; embedConfigId: number; name?: string; email?: string; phone?: string },
): Promise<VisitorRow | undefined> {
  const where = { visitor_key: opts.visitorKey, embed_config_id: opts.embedConfigId };
  const hasEmail = !!opts.email;

  const patch: Record<string, unknown> = { contact_source: "volunteered", updated_at: db.fn.now() };
  // REPLACED, not COALESCE'd. These used to only fill a blank, so "sorry, it's john@gmail.com
  // not john@gmial.com" landed nowhere and the summary went to the typo — which is somebody
  // else's inbox, holding this visitor's conversation. The extractor reports only what the
  // LATEST message states (see lib/profile-extract), so a value arriving here is a fresh
  // statement rather than a re-read of an old one, and the newest statement is the one to keep.
  if (opts.name) patch.name = opts.name;
  if (opts.email) patch.email = opts.email;
  if (opts.phone) patch.phone = opts.phone;

  if (hasEmail) {
    // Enough to stop asking: we have what the card exists to collect, and asking someone for
    // something they just told us reads as not listening.
    patch.contact_status = "submitted";
    // When we FIRST got details, not when they last corrected them.
    patch.contact_submitted_at = db.raw("COALESCE(contact_submitted_at, now())");
    // +1 because this runs DURING the turn that carried the address: recordTurn has not
    // incremented yet, so the stored count is still the one before this message. COALESCE for
    // the same reason as the timestamp — a later correction must not move where it happened.
    patch.contact_submitted_at_count = db.raw("COALESCE(contact_submitted_at_count, message_count + 1)");
  }

  // NOTE WHAT IS DELIBERATELY ABSENT: summary_status.
  //
  // This used to arm the summary the moment an address appeared in the chat, and that was wrong
  // in a way worth spelling out, because the card path looks identical and is fine. The card's
  // own copy asks "want a copy of this conversation?" — submitting it IS the request. An address
  // typed in passing is not: the visitor may have been giving it for a brochure, for an
  // application, or to a human. Arming on that meant chat-summary.worker would mail them the
  // entire transcript once they went idle (it sends on `end_confirmed` OR an idle cutoff, so no
  // acceptance was ever required), to an address given for something else.
  //
  // The consent already exists further along: once we hold an email, decidePrompt offers the
  // end-of-chat card at a natural ending, and accepting it runs recordConversationEnd, which is
  // what sets `pending`. Volunteering an address makes that offer possible; it is not the offer.

  const [row] = await db<VisitorRow>(TABLE)
    .where(where)
    // `contact_status = 'submitted'` is NOT the guard any more, and that was the bug: it means
    // "we have asked and been answered, stop showing the card", not "this address is now
    // immutable". It only read as immutability because the card was once the sole writer.
    //
    // What actually must not be overwritten is narrower, and these are it:
    //
    //   1. An address the visitor TYPED INTO THE FORM. That is their own keystrokes, confirmed
    //      in a field they could see; a model reading a later sentence does not get to replace
    //      it. IS DISTINCT FROM, not whereNot: `NOT (contact_source = 'card')` is NULL for a row
    //      that never had contact details, and a NULL predicate excludes the row — which would
    //      lock out the very first volunteered capture.
    //   2. An address a summary has already gone to. Once it is sent, correcting the column
    //      changes nothing that happened and only loses the record of where it went.
    .whereRaw("contact_source IS DISTINCT FROM 'card'")
    .where((q) => q.whereNull("summary_status").orWhere({ summary_status: "pending" }))
    .update(patch)
    .returning("*");
  return row;
}

/** Serialized size past which a merge is dropped. A bag merged every turn would otherwise grow
 *  without limit, and this row is read on every single one. */
const MAX_META_BYTES = 4096;

/**
 * Merge server-observed details into the visitor's `meta`.
 *
 * Shallow merge in SQL (`meta || patch`) rather than the read-modify-write recordProfile needs:
 * there is no per-entry dedupe to do here, so one statement is enough and two turns landing
 * together cannot lose each other's keys.
 *
 * Best-effort and size-capped. Nothing here is worth failing a turn for, and a bag that grows
 * every message would quietly become the most expensive column on the row.
 *
 * Call it with what the REQUEST carried. Never with anything a model returned — see the
 * migration for why that is a rule rather than a preference.
 */
export async function recordMeta(
  db: Knex,
  visitorId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const json = JSON.stringify(patch);
  if (json.length > MAX_META_BYTES) {
    logger.warn("Visitor meta patch too large; dropped", { visitorId, bytes: json.length, keys });
    return;
  }
  await db(TABLE)
    .where({ id: visitorId })
    .update({
      meta: db.raw("meta || ?::jsonb", [json]),
      updated_at: db.fn.now(),
    });
}

/** Where this institution's own subjects are answered — one row per visitor per field. */
const CUSTOM_TABLE = "ai_widget_visitor_custom_values";

/**
 * Write what the visitor said about this institution's own subjects (20261002_001).
 *
 * One statement, upserted on (visitor_id, field_key): the latest answer wins, and two turns
 * landing together cannot lose each other's fields the way a read-modify-write over a bag would.
 * `created_at` is left alone by the merge, so it keeps saying when they first told us.
 *
 * Deliberately NOT merged into recordMeta: that bag holds what the server observed, this holds
 * what a model read out of the conversation, and one function writing both would be one rename
 * away from crossing the line 20261001_002 draws. What may be in the patch is decided by
 * profile-extract.cleanCustom, which keys off the institution's configured fields.
 */
export async function recordCustom(
  db: Knex,
  visitorId: number,
  values: Record<string, string>,
): Promise<void> {
  const rows = Object.entries(values).map(([field_key, value]) => ({ visitor_id: visitorId, field_key, value }));
  if (!rows.length) return;
  await db(CUSTOM_TABLE)
    .insert(rows)
    .onConflict(["visitor_id", "field_key"])
    // Spelled out rather than `.merge(["value","updated_at"])`: that form sets updated_at from
    // `excluded`, i.e. the proposed row's column default, which is a round-trip through Postgres
    // semantics to say "now". This says it.
    .merge({ value: db.ref("excluded.value"), updated_at: db.fn.now() });
}

/**
 * This visitor's answers, keyed by field. Empty when they have given none.
 *
 * Returns everything stored rather than filtering by the current field list: the caller holds
 * that list and gates the READ with it (visitorCounsellingContext), which is the one place the
 * rule belongs — a field the institution deleted stops being used while its row stays put.
 */
export async function customValuesFor(db: Knex, visitorId: number): Promise<Record<string, string>> {
  const rows: Array<{ field_key: string; value: string }> = await db(CUSTOM_TABLE)
    .where({ visitor_id: visitorId })
    .select("field_key", "value");
  return Object.fromEntries(rows.map((r) => [r.field_key, r.value]));
}
