/** Wire types for the public embed widget API. */

import type { CourseCard } from "@/app/ai/apis/types";
import type { EmbedOwnerKind } from "../const";

/** Public branding subset of an embed config — all the widget ever sees. */
export type EmbedPublicConfig = {
  display_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  /** Drives the starter questions — an institution's widget is scoped to its own catalog. */
  owner_kind: EmbedOwnerKind;
};

/** Card shape the backend streams (prompt format) — adapted to the shared CourseCard for rendering. */
export type WireCourseCard = {
  id: string | null;
  slug?: string | null;
  name: string | null;
  institution: string | null;
  institution_logo_url: string | null;
  institution_cover_url: string | null;
  degree_level: string | null;
  duration: string | null;
  fees: number | null;
  currency: string | null;
  fee_period?: string | null;
  country: string | null;
  city: string | null;
  intakes: string[] | null;
  study_modes: string[] | null;
  source_url: string | null;
};

/** Copy for the inline contact card, written server-side so it can name the institution. */
export type EmbedContactPrompt = {
  heading: string;
  body: string;
};

/**
 * The offer to end the chat and be emailed a summary.
 *
 * `covered` is the counsellor's own clause describing what was discussed — it is why this reads
 * as part of the conversation rather than as a timed pop-up. Null when the model classified the
 * conversation as finished but did not write one, in which case the card drops that sentence.
 *
 * The model's INTERNAL reason for the classification is deliberately not here: it is written for
 * our logs, in a register that would read badly to a visitor.
 */
export type EmbedEndPrompt = {
  heading: string;
  body: string;
  covered: string | null;
  email: string | null;
};

export type EmbedChatEvent =
  | { type: "delta"; text: string }
  | { type: "trace"; step: string }
  | { type: "cards"; cards: CourseCard[] }
  | { type: "chips"; chips: string[] }
  | { type: "contact-prompt"; prompt: EmbedContactPrompt }
  | { type: "end-prompt"; prompt: EmbedEndPrompt }
  | { type: "done" };

export type GuestContactRequest = {
  embed_key: string;
  fingerprint: string;
  action: "submit" | "skip";
  name?: string;
  email?: string;
};

export type GuestConversationEndRequest = {
  embed_key: string;
  fingerprint: string;
  action: "end" | "continue";
};

/** `summary_queued` is false when they confirmed without ever giving an address. */
export type GuestConversationEndResponse = {
  ok: boolean;
  summary_queued?: boolean;
};

/** One stored turn of the visitor's thread, as /guest/session returns it. */
export type EmbedStoredMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  cards: WireCourseCard[];
  chips: string[];
  created_at: string;
};

export type EmbedThread = {
  session_id: number | null;
  messages: EmbedStoredMessage[];
};

export type GuestMessageRequest = {
  content: string;
  fingerprint: string;
  embed_key: string;
};
