/** Wire types for the AI Counsellor API. */

export type ChatSession = {
  id: number;
  title: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type MessageRole = "user" | "assistant";

export type CourseCard = {
  /** Extraction course id — used as the compare-store key. */
  id?: string;
  /** Slug for the internal /course/[slug] detail page. Absent on cards persisted before slugs shipped. */
  slug?: string | null;
  institution_name: string;
  course_name: string;
  degree_level: string;
  duration: string;
  annual_tuition_fee: number | null;
  currency: string;
  country: string;
  intakes: string[];
  study_modes: string[];
  source_url: string | null;
};

/** Clickable option — the value is sent as the user's next message. */
export type BlockAction = { label: string; value: string };

/**
 * Structured UI blocks the counsellor emits alongside prose. Discriminated by
 * `type`; unknown types are ignored by the renderer so new ones can ship
 * backend-first. Mirrors backend ai-counsellor/lib/card-parser.ts.
 */
export type ResponseBlock =
  | { type: "comparison"; title?: string; columns: string[]; rows: { label: string; values: string[] }[] }
  | { type: "breakdown"; title?: string; items: { title: string; description?: string }[] }
  | { type: "timeline"; title?: string; steps: { title: string; description?: string }[] }
  | { type: "recommendation"; title: string; subtitle?: string; description?: string; image_url?: string; tags?: string[]; actions?: BlockAction[] }
  | { type: "image"; url: string; title?: string; caption?: string }
  | { type: "quick_replies"; question?: string; options: BlockAction[] };

export type Message = {
  id: number;
  session_id: number;
  role: MessageRole;
  content: string;
  cards: CourseCard[];
  chips: string[];
  blocks: ResponseBlock[];
  feedback: "up" | "down" | null;
  /** Storage paths (or, for optimistic messages, filenames) of files sent with the message. */
  attachments?: string[];
  created_at: string;
};

export type SendMessageInput = {
  session_id: number | null;
  content: string;
  attachments?: string[];
};

/** Card shape as the backend streams it (prompt format). Mapped to CourseCard for rendering. */
export type WireCourseCard = {
  id?: string;
  slug?: string;
  name?: string;
  institution?: string;
  degree_level?: string;
  duration?: string;
  fees?: number | null;
  currency?: string;
  country?: string;
  intakes?: string[];
  study_modes?: string[];
  source_url?: string | null;
};

export type AttachmentUpload = {
  storage_path: string;
  filename: string;
  mime_type: string;
  size: number;
};

/** Server-sent event types from the streaming endpoint. */
export type SSEEvent =
  | { type: "session_created"; session: ChatSession }
  | { type: "trace"; step: string }
  | { type: "delta"; text: string }
  | { type: "cards"; cards: CourseCard[] }
  | { type: "chips"; chips: string[] }
  | { type: "blocks"; blocks: ResponseBlock[] }
  | { type: "done"; message_id: number }
  | { type: "error"; error: string };

export type SessionListResponse = { sessions: ChatSession[] };
export type MessagesResponse = { messages: Message[] };
export type FeedbackInput = { feedback: "up" | "down" | null };

export type CreditBalance = {
  free: number;
  subscription: number;
  purchased: number;
  total: number;
};

/** Extended SSE event for guest mode */
export type GuestSSEEvent = SSEEvent | { type: "guest-meta"; replies_remaining: number; fingerprint_hash: string };
