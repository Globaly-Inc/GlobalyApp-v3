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
  created_at: string;
};

export type SendMessageInput = {
  session_id: number | null;
  content: string;
};

/**
 * Events the store consumes. This is the view's vocabulary, not the wire's — the
 * backend's SSE frames are translated into it inside apis/real-api.ts, which is
 * the only file that knows the wire format.
 */
export type SSEEvent =
  | { type: "session_created"; session: ChatSession }
  | { type: "trace"; step: string }
  | { type: "delta"; text: string }
  | { type: "cards"; cards: CourseCard[] }
  | { type: "chips"; chips: string[] }
  /** Emitted once per turn, carrying what the turn actually cost. */
  | { type: "usage"; credits_charged: number }
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

/**
 * Result of adopting a pre-signup transcript. `migrated` is true only for the call
 * that actually moved it; a repeat returns the same `session_id` with false.
 */
export type GuestMigrationResult = {
  session_id: number | null;
  migrated: boolean;
};
