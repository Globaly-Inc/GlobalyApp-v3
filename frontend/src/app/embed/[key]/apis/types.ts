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

export type EmbedChatEvent =
  | { type: "delta"; text: string }
  | { type: "trace"; step: string }
  | { type: "cards"; cards: CourseCard[] }
  | { type: "chips"; chips: string[] }
  | { type: "done" };

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
