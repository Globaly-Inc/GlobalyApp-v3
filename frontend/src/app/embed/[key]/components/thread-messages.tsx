"use client";

import { Fragment } from "react";
import { ChatMessage } from "@/app/ai/components/chat-message";
import type { WidgetMessage } from "../utils";
import { AgentMessage } from "./agent-message";

/** A centred system line between turns. */
function Divider({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="flex items-center gap-3 text-[11px] text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
      {children}
    </p>
  );
}

/**
 * The thread, with a line wherever the speaker changes hands: "Alex joined" before the first
 * staff reply in a run, "The AI assistant is back" when the AI answers after one. Derived from
 * the roles, so a reload draws the same lines and nothing extra is stored.
 *
 * `joinedAgent` is who the server says has taken over. A staff member who has joined but not
 * written yet has no message to hang the line on, so it trails the thread until they do —
 * then their first reply draws it in its place.
 */
export function ThreadMessages({
  messages,
  onChipClick,
  onSend,
  joinedAgent,
}: Readonly<{
  messages: WidgetMessage[];
  onChipClick: (chip: string) => void;
  /** Sends the text composed inside a quick_replies block. */
  onSend?: (value: string) => void;
  joinedAgent?: string | null;
}>) {
  // The visitor's own turns don't change who is answering, so look back past them.
  // A plain loop, not .map: the React compiler rejects a variable mutated inside a callback.
  let lastAnswerer: string | null = null;
  const rows: React.ReactNode[] = [];
  for (const m of messages) {
    let line: string | null = null;
    if (m.role !== "user") {
      if (m.role === "agent" && lastAnswerer !== "agent") {
        line = `${m.sender_name?.split(" ")[0] ?? "Someone"} from the admissions team joined`;
      } else if (m.role === "assistant" && lastAnswerer === "agent") {
        line = "The AI assistant is back";
      }
      lastAnswerer = m.role;
    }
    rows.push(
      <Fragment key={m.id}>
        {line && <Divider>{line}</Divider>}
        {m.role === "agent" ? <AgentMessage message={m} /> : <ChatMessage message={m} onChipClick={onChipClick} onSend={onSend} />}
      </Fragment>,
    );
  }
  if (joinedAgent && lastAnswerer !== "agent") {
    rows.push(<Divider key="joined">{joinedAgent.split(" ")[0]} from the admissions team joined</Divider>);
  }
  return rows;
}
