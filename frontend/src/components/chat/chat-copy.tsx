"use client";

import { createContext, useContext, useMemo } from "react";

/**
 * The handful of strings in this kit that name the OTHER side.
 *
 * Almost nothing here is side-specific — the counterpart's name arrives as data, so a row,
 * a header or a composer needs no wording of its own. But three places make a statement
 * about who is on the other end ("a business unlocks your enquiry", "for the business"),
 * and those read as a lie on the business side.
 *
 * A context rather than props: `message-actions` sits two levels below the container
 * (view → list → row → actions), and threading one sentence through three components that
 * otherwise don't care is worse than this. The defaults are the student's wording, so an
 * un-wrapped tree behaves exactly as it did before this existed.
 */
export interface ChatCopy {
  /** Sidebar, when the viewer has no conversations at all. */
  emptyInbox: string;
  /** An open thread with no messages in it yet. */
  emptyThread: string;
  /** Who else loses sight of a deleted message, e.g. "the business" / "the student". */
  otherSide: string;
}

const STUDENT_COPY: ChatCopy = {
  emptyInbox: "A conversation opens as soon as a business unlocks one of your enquiries.",
  emptyThread: "No messages yet — say hello and ask them anything about your enquiry.",
  otherSide: "the business",
};

const ChatCopyContext = createContext<ChatCopy>(STUDENT_COPY);

export function ChatCopyProvider({
  copy,
  children,
}: Readonly<{ copy: Partial<ChatCopy>; children: React.ReactNode }>) {
  // Merged so a caller can override one line without restating the rest.
  const value = useMemo(() => ({ ...STUDENT_COPY, ...copy }), [copy]);
  return <ChatCopyContext.Provider value={value}>{children}</ChatCopyContext.Provider>;
}

export function useChatCopy(): ChatCopy {
  return useContext(ChatCopyContext);
}
