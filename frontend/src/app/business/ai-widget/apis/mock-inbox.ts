// The Inbox's side of the AI widget: transcripts, and the human-takeover calls the backend
// doesn't serve yet. Transcripts are stored rather than generated per call, so a staff reply
// survives the 5-second poll and the demo behaves like the real thing.

import type { MessageAttachment } from "@/components/chat/types";
import { mockVisitors } from "./mock-visitors";
import type {
  ConversationControl, ConversationControlResult, HandoffMode, SendVisitorMessageResult, VisitorChat, VisitorMessage, VisitorNote, WidgetVisitor,
} from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** The signed-in staff member, as the server would read them from the token. */
const MOCK_AGENT = { id: 1, name: "Alex Morgan" };

let nextId = 1000;
const transcripts: Record<number, VisitorMessage[]> = {};
const notes: Record<number, VisitorNote[]> = {};
const uploads = new Map<string, MessageAttachment>();
/** One simulated visitor reply per chat, so the poll has something to pick up. */
const replied = new Set<number>();

/** Visitor 3 has an ended chat and an open one; everyone else one open chat, from the transcript. */
function mockChats(id: number): VisitorChat[] {
  const t = transcript(id);
  const open: VisitorChat = {
    id: id * 100 + 2,
    started_at: t[0]?.created_at ?? new Date().toISOString(),
    ended_at: null,
    message_count: t.length,
    summary: {
      title: "Data science entry requirements",
      text: "Asked whether we offer a **Masters in Data Science**; told it runs **18 months** with February and July intakes.",
      open: ["Fees"],
      next_step: null,
      generated_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    },
  };
  if (id !== 3) return [open];
  return [
    {
      id: id * 100 + 1,
      started_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
      ended_at: new Date(Date.now() - 25.5 * 3_600_000).toISOString(),
      message_count: 8,
      summary: {
        title: "MBA entry requirements",
        text: "Career changer asking about the **MBA**; told a **GRE of 318** meets the requirement. Ended the chat and asked for a summary.",
        open: [],
        next_step: null,
        generated_at: new Date(Date.now() - 25 * 3_600_000).toISOString(),
      },
    },
    open,
  ];
}

function transcript(id: number): VisitorMessage[] {
  if (!transcripts[id]) {
    transcripts[id] = [
      { id: id * 10 + 1, role: "user", content: "Hi, do you offer a Masters in Data Science?", created_at: ago(30) },
      { id: id * 10 + 2, role: "assistant", content: "Yes! Our **MSc Data Science** runs for 18 months with February and July intakes.", created_at: ago(29) },
      { id: id * 10 + 3, role: "user", content: "What IELTS score do I need?", created_at: ago(27) },
      { id: id * 10 + 4, role: "assistant", content: "An overall **6.5** with no band below 6.0.", created_at: ago(26) },
    ];
    const visitor = mockVisitors.find((v) => v.id === id);
    if (visitor?.handled_by_name && !visitor.handled_by_me) {
      transcripts[id].push(
        { id: id * 10 + 5, role: "agent", sender_name: visitor.handled_by_name, content: "Hi, I'm Manjil from admissions 👋 Happy to help with your application.", created_at: ago(25) },
        { id: id * 10 + 6, role: "user", content: "Can I apply with a 6.0 in writing?", created_at: ago(3) },
        { id: id * 10 + 7, role: "user", content: "And is there a scholarship?", created_at: ago(2) },
      );
    }
  }
  return transcripts[id];
}

function find(id: number): WidgetVisitor {
  const visitor = mockVisitors.find((v) => v.id === id);
  if (!visitor) throw new Error("Visitor not found");
  return visitor;
}

const control = (v: WidgetVisitor): ConversationControl => ({
  handled_by_user_id: v.handled_by_user_id ?? null,
  handled_by_name: v.handled_by_name ?? null,
  handled_by_me: v.handled_by_me ?? false,
  handled_at: v.handled_at ?? null,
  handoff_requested_at: v.handoff_requested_at ?? null,
  resolved_at: v.resolved_at ?? null,
  resolved_by_name: v.resolved_by_name ?? null,
  unread_count: v.unread_count ?? 0,
});

function takeOver(v: WidgetVisitor) {
  Object.assign(v, {
    handled_by_user_id: MOCK_AGENT.id, handled_by_name: MOCK_AGENT.name, handled_by_me: true,
    handled_at: new Date().toISOString(), resolved_at: null, resolved_by_name: null, handoff_requested_at: null,
  });
}

function handBack(v: WidgetVisitor) {
  Object.assign(v, { handled_by_user_id: null, handled_by_name: null, handled_by_me: false, handled_at: null, handoff_requested_at: null });
}

/** What the visitor would do next: answer the person who just joined. */
function scheduleVisitorReply(v: WidgetVisitor) {
  if (replied.has(v.id)) return;
  replied.add(v.id);
  setTimeout(() => {
    transcript(v.id).push({ id: nextId++, role: "user", content: "Thanks, that really helps! When is the application deadline?", created_at: new Date().toISOString() });
    Object.assign(v, {
      unread_count: (v.unread_count ?? 0) + 1,
      message_count: v.message_count + 1,
      last_activity_at: new Date().toISOString(),
      resolved_at: null,
    });
  }, 8_000);
}

export const aiWidgetInboxMock = {
  listVisitorMessages: async (id: number): Promise<VisitorMessage[]> => {
    console.log("[mock] GET /ai-chat/embed/visitors/" + id + "/messages");
    await delay(250);
    // One chat per mock visitor: its first message carries the chat, like the real transcript.
    const [chat] = mockChats(id);
    return transcript(id).map((m, i) => ({ ...m, session_id: chat?.id, ...(i === 0 && chat ? { chat } : {}) }));
  },

  listVisitorChats: async (id: number): Promise<VisitorChat[]> => {
    console.log("[mock] GET /ai-chat/embed/visitors/" + id + "/chats");
    await delay(200);
    return mockChats(id);
  },

  sendVisitorMessage: async (id: number, body: string, attachments: string[]): Promise<SendVisitorMessageResult> => {
    console.log("[mock] POST /ai-chat/embed/visitors/" + id + "/messages", { body, attachments });
    await delay(350);
    const v = find(id);
    // A reply takes over only an AI-handled chat; a colleague's chat keeps its handler.
    if (!v.handled_by_user_id) takeOver(v);
    if (v.handled_by_me) v.handled_at = new Date().toISOString();
    const message: VisitorMessage = {
      id: nextId++,
      role: "agent",
      sender_name: MOCK_AGENT.name,
      content: body,
      attachments: attachments.flatMap((path) => uploads.get(path) ?? []),
      created_at: new Date().toISOString(),
    };
    transcript(id).push(message);
    Object.assign(v, { unread_count: 0, resolved_at: null, resolved_by_name: null, last_activity_at: message.created_at, message_count: v.message_count + 1 });
    scheduleVisitorReply(v);
    return { message: { ...message }, control: control(v) };
  },

  setVisitorHandoff: async (id: number, mode: HandoffMode): Promise<ConversationControlResult> => {
    console.log("[mock] PATCH /ai-chat/embed/visitors/" + id + "/handoff", { mode });
    await delay(300);
    const v = find(id);
    if (mode === "human") takeOver(v);
    else handBack(v);
    return { control: control(v) };
  },

  resolveVisitorChat: async (id: number, resolved: boolean): Promise<ConversationControlResult> => {
    console.log("[mock] PATCH /ai-chat/embed/visitors/" + id + "/resolve", { resolved });
    await delay(300);
    const v = find(id);
    if (resolved) {
      // Resolving hands the chat back, so the AI answers if the visitor writes again.
      handBack(v);
      Object.assign(v, { resolved_at: new Date().toISOString(), resolved_by_name: MOCK_AGENT.name, unread_count: 0 });
    } else {
      Object.assign(v, { resolved_at: null, resolved_by_name: null });
    }
    return { control: control(v) };
  },

  markVisitorChatRead: async (id: number): Promise<void> => {
    console.log("[mock] POST /ai-chat/embed/visitors/" + id + "/read");
    await delay(150);
    find(id).unread_count = 0;
  },

  listVisitorNotes: async (id: number): Promise<VisitorNote[]> => {
    console.log("[mock] GET /ai-chat/embed/visitors/" + id + "/notes");
    await delay(200);
    return (notes[id] ?? []).map((n) => ({ ...n }));
  },

  addVisitorNote: async (id: number, body: string, attachments: string[] = []): Promise<VisitorNote> => {
    console.log("[mock] POST /ai-chat/embed/visitors/" + id + "/notes", { body, attachments });
    await delay(250);
    const note = {
      id: nextId++, author_name: MOCK_AGENT.name, content: body, created_at: new Date().toISOString(),
      attachments: attachments.flatMap((path) => uploads.get(path) ?? []),
    };
    (notes[id] ??= []).push(note);
    return { ...note };
  },

  uploadVisitorAttachment: async (file: File): Promise<MessageAttachment> => {
    console.log("[mock] POST /ai-chat/embed/visitors/messages/media", { name: file.name });
    await delay(400);
    const attachment: MessageAttachment = {
      storage_path: `mock/embed/${Date.now()}-${file.name}`,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      url: URL.createObjectURL(file),
    };
    uploads.set(attachment.storage_path, attachment);
    return attachment;
  },
};
