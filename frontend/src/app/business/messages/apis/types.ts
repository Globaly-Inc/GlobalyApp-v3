// Wire types for the business chat inbox — everything under /enquiry-distributions.
//
// The rendering shapes live in @/components/chat/types, shared with the student chat.
// This file holds only what is specific to the BUSINESS endpoints: the counterpart. A
// business's counterpart is the student, so the wire says `student_name`/`student_avatar`
// where the student's endpoints say `business_name`/`logo_url`. The kit's components read
// the neutral `counterpart_name`/`counterpart_avatar`, and the two mappers below are that
// translation, applied once at the api boundary.

import type { ChatThread, EnquiryMessage, StarredMessage } from "@/components/chat/types";

export type {
  ChatThread,
  EnquiryMessage,
  MessageAttachment,
  MessageReaction,
  StarredMessage,
} from "@/components/chat/types";

/** One thread exactly as GET /enquiry-distributions/messages returns it. */
export interface BusinessThreadWire {
  distribution_id: string;
  enquiry_id: string;
  /** The thread's shared name, or null when nobody has named it. */
  title: string | null;
  /** Signed URL for the thread's shared picture, or null when nobody has set one. */
  thread_photo: string | null;
  /** This agent's role on the thread — admins may rename it. */
  my_role: ThreadRole;
  student_name: string;
  student_avatar: string | null;
  course_name: string;
  is_closed: boolean;
  unlocked_at: string;
  last_message_at: string | null;
  last_message_body: string | null;
  /** This AGENT's own message — not merely "from our side". A teammate's reply is false. */
  last_message_is_mine: boolean;
  /** Messages from the student since this agent's read cursor. Per agent, not per business. */
  unread_count: number;
  is_favorite: boolean;
}

/** One starred message as GET /enquiry-distributions/messages/starred returns it. */
export interface BusinessStarredWire extends EnquiryMessage {
  distribution_id: string;
  student_name: string;
  course_name: string;
}

export const toChatThread = (t: BusinessThreadWire): ChatThread => ({
  distribution_id: t.distribution_id,
  enquiry_id: t.enquiry_id,
  title: t.title,
  thread_photo: t.thread_photo,
  my_role: t.my_role,
  counterpart_name: t.student_name,
  counterpart_avatar: t.student_avatar,
  course_name: t.course_name,
  is_closed: t.is_closed,
  unlocked_at: t.unlocked_at,
  last_message_at: t.last_message_at,
  last_message_body: t.last_message_body,
  last_message_is_mine: t.last_message_is_mine,
  unread_count: t.unread_count,
  is_favorite: t.is_favorite,
});

export const toStarredMessage = (m: BusinessStarredWire): StarredMessage => ({
  ...m,
  counterpart_name: m.student_name,
});

// ── Thread membership (the Space roster) ──

export type ThreadRole = "admin" | "member";

export type ThreadMember = {
  platform_user_id: number;
  role: ThreadRole;
  /** 'auto' = the owner or the agent who unlocked. Structural, so not removable. */
  source: "auto" | "manual";
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  photo_url: string | null;
  created_at: string;
};

export type ThreadMembersResult = {
  /** The caller's own role, so the UI need not find itself in the list. */
  my_role: ThreadRole;
  /** Which row in `members` is the caller — the roster offers Leave there and manage elsewhere. */
  my_user_id: number;
  can_manage: boolean;
  /** False while an open thread still needs them — the last member, or the last admin. */
  can_leave: boolean;
  /**
   * Null when they can leave. Otherwise the exact sentence the leave endpoint would throw, so the
   * panel never has to reason about the rules itself and cannot contradict the server.
   */
  leave_blocked_reason: string | null;
  members: ThreadMember[];
};

export type MemberCandidate = {
  platform_user_id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  photo_url: string | null;
};
