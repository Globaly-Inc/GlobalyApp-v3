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

export type Message = {
  id: number;
  session_id: number;
  role: MessageRole;
  content: string;
  cards: CourseCard[];
  chips: string[];
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
