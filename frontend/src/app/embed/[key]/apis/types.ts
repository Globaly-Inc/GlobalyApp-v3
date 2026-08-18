/** Wire types for the public embed widget API. */

import type { CourseCard } from "@/app/personal/ai/apis/types";

/** Public branding subset of an embed config — all the widget ever sees. */
export type EmbedPublicConfig = {
  display_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
};

/** Card shape the backend streams (prompt format) — adapted to the shared CourseCard for rendering. */
export type WireCourseCard = {
  id: string | null;
  slug?: string | null;
  name: string | null;
  institution: string | null;
  degree_level: string | null;
  duration: string | null;
  fees: number | null;
  currency: string | null;
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

export type GuestMessageRequest = {
  content: string;
  fingerprint: string;
  embed_key: string;
};
