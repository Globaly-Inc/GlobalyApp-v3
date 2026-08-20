// Wire types for the student's chat inbox — GET/POST /enquiry-messages.
//
// Chat is addressed by DISTRIBUTION, not enquiry: one enquiry has a separate thread per
// business that unlocked it, and `enquiry_distributions` already is that pair.

/**
 * One conversation in the inbox. Only unlocked distributions have threads, so this list
 * IS the set of conversations that exist — nothing here is a placeholder.
 */
export interface MessageThreadSummary {
  distribution_id: string;
  /** Where the thread came from, for the "View enquiry" link back. */
  enquiry_id: string;
  business_name: string;
  logo_url: string | null;
  course_name: string;
  /** Closed by the business — history stays readable, no new messages. */
  is_closed: boolean;
  unlocked_at: string;
  /** Null until someone has actually said something; the row falls back to unlocked_at. */
  last_message_at: string | null;
}

/**
 * `sender_role` says which SIDE sent it and does not depend on who is looking, unlike
 * `is_mine` — needed to label an incoming bubble with the business rather than the
 * individual agent.
 */
export interface EnquiryMessage {
  id: number;
  body: string;
  created_at: string;
  sender_id: number;
  sender_name: string;
  /** Signed URL for the sender's profile photo; null when they have none. */
  sender_avatar: string | null;
  is_mine: boolean;
  sender_role: "student" | "business";
}
