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
