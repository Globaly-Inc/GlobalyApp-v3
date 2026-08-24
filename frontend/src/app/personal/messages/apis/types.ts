// Wire types for the student's chat inbox — GET/POST /enquiry-messages.
//
// The rendering shapes live in @/components/chat/types, shared with the business chat.
// This file holds only what is specific to the STUDENT endpoints: how the server names
// the counterpart. The student's counterpart is the business, so the wire says
// `business_name`/`logo_url`; the kit's components read `counterpart_name`/
// `counterpart_avatar`. `toChatThread`/`toStarredMessage` are that translation, applied
// once at the api boundary so nothing downstream has to care.

import type { ChatThread, EnquiryMessage, StarredMessage } from "@/components/chat/types";

export type {
  ChatThread,
  EnquiryMessage,
  MessageAttachment,
  MessageReaction,
  StarredMessage,
} from "@/components/chat/types";

/** One thread exactly as GET /enquiry-messages returns it. */
export interface ThreadWire {
  distribution_id: string;
  enquiry_id: string;
  business_name: string;
  logo_url: string | null;
  course_name: string;
  is_closed: boolean;
  unlocked_at: string;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_is_mine: boolean;
  unread_count: number;
  is_favorite: boolean;
}

/** One starred message exactly as GET /enquiry-messages/starred returns it. */
export interface StarredWire extends EnquiryMessage {
  distribution_id: string;
  business_name: string;
  course_name: string;
}

export const toChatThread = (t: ThreadWire): ChatThread => ({
  distribution_id: t.distribution_id,
  enquiry_id: t.enquiry_id,
  counterpart_name: t.business_name,
  counterpart_avatar: t.logo_url,
  course_name: t.course_name,
  is_closed: t.is_closed,
  unlocked_at: t.unlocked_at,
  last_message_at: t.last_message_at,
  last_message_body: t.last_message_body,
  last_message_is_mine: t.last_message_is_mine,
  unread_count: t.unread_count,
  is_favorite: t.is_favorite,
});

export const toStarredMessage = (m: StarredWire): StarredMessage => ({
  ...m,
  counterpart_name: m.business_name,
});
