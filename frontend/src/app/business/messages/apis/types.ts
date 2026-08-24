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
