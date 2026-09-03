// Shared chat types — the shapes every component in this kit renders.
//
// Chat is addressed by DISTRIBUTION, not enquiry: one enquiry has a separate thread per
// business that unlocked it, and `enquiry_distributions` already is that pair.
//
// The COUNTERPART is deliberately neutral. A student's counterpart is the business; a
// business's counterpart is the student. Both sides' wire responses name it differently
// (`business_name`/`logo_url` vs `student_name`/`student_avatar`), so each feature's api
// layer maps its response onto these fields — that way no component has to know which
// side it is rendering, and no type ever carries a student's name in a field called
// `business_name`.

/**
 * One conversation in the inbox. Only unlocked distributions have threads, so this list
 * IS the set of conversations that exist — nothing here is a placeholder.
 */
export interface ChatThread {
  distribution_id: string;
  /** Where the thread came from, for the "View enquiry" link back. */
  enquiry_id: string;
  /**
   * A name the thread's admin gave it, shared by everyone on the thread — the other agents and the
   * student alike. Null until someone names it, which is when each side falls back to
   * `counterpart_name`. Read it through `threadTitle()`, never directly.
   */
  title: string | null;
  /**
   * A picture the thread's admin gave it, shared the same way `title` is. Signed URL, or null when
   * nobody has set one — which is when each side falls back to `counterpart_avatar`. Read it
   * through `threadAvatar()`, never directly.
   */
  thread_photo: string | null;
  /** Who the thread is with: the business for a student, the student for a business. */
  counterpart_name: string;
  /** Signed URL for their logo or photo; null when they have none. */
  counterpart_avatar: string | null;
  course_name: string;
  /** Closed by the business — history stays readable, no new messages. */
  is_closed: boolean;
  unlocked_at: string;
  /** Null until someone has actually said something; the row falls back to unlocked_at. */
  last_message_at: string | null;
  /** Newest message's text, for the list's preview line. Null on an empty thread. */
  last_message_body: string | null;
  /** The preview is prefixed "You:" when the VIEWER sent the newest message. */
  last_message_is_mine: boolean;
  /** Messages from the other side since this viewer last opened the thread. */
  unread_count: number;
  /** Pinned to the sidebar's Favorites section. Per viewer. */
  is_favorite: boolean;
  /**
   * This viewer's role on the thread — only an admin may rename it. Business side only: the student
   * holds no `enquiry_thread_members` row, so their threads carry no role and cannot be renamed.
   */
  my_role?: "admin" | "member";
}

/**
 * What a message row IS. Mirrors the CHECK on enquiry_messages.kind — see the 20260901_002
 * migration for why the verb is stored rather than derived from the sentence.
 */
export type MessageKind =
  | "message"
  | "member_added"
  | "member_removed"
  | "member_left"
  | "admin_granted"
  | "admin_revoked"
  | "renamed"
  | "photo_changed";

/** One file sent with a message. `url` is a freshly signed, expiring view URL. */
export interface MessageAttachment {
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
}

/**
 * `sender_role` says which SIDE sent it and does not depend on who is looking, unlike
 * `is_mine`. Both matter: a business agent reading a teammate's message gets
 * `is_mine: false` with `sender_role: "business"`, which is what lets the business UI
 * attribute it to that colleague by name.
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
  /** The VIEWER's own bookmark on this message — drives the Starred shortcut. */
  is_starred: boolean;
  /** Pinned to the conversation — shown in the info panel. Shared by both sides. */
  is_pinned: boolean;
  attachments: MessageAttachment[];
  /** Set when this message is a thread reply. Threads are one level deep. */
  reply_to_id: number | null;
  /** Replies anchored to this message — drives the "N replies" link. */
  reply_count: number;
  reactions: MessageReaction[];
  /** Set once the sender edited it — the row shows V2's "(edited)" marker. */
  edited_at: string | null;
  /**
   * Anything but "message" is a thread event, not something a person typed. MessageList renders
   * those as a one-line pill with no avatar, bubble or actions, and picks the icon from this value
   * rather than by reading the sentence. `sender_*` still describes whoever caused it.
   */
  kind: MessageKind;
}

/** One reaction chip: the emoji, how many used it, who, and whether you did. */
export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  mine: boolean;
}

/** A starred message plus the conversation it came from, for the Starred view's badge. */
export interface StarredMessage extends EnquiryMessage {
  distribution_id: string;
  /** Same neutrality as ChatThread: whoever the thread is with. */
  counterpart_name: string;
  course_name: string;
}
