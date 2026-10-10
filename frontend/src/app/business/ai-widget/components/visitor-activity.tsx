"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { SectionCard } from "@/app/personal/profile/section-card";
import { relativeTime } from "@/components/feed/utils";
import { cn } from "@/lib/utils";
import type { VisitorChat, WidgetVisitor } from "../apis/types";
import { RATING_FACES } from "../const";
import { Emphasised } from "./visitor-insight-cards";

const dayTime = (at: string) =>
  new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (at: string) => new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** A chat's name: its topic, from its own summary, or the day it happened until there is one. */
export function chatTitle(c: Pick<VisitorChat, "started_at" | "summary">): string {
  return c.summary?.title || `Chat on ${day(c.started_at)}`;
}

type Item =
  | { kind: "chat"; at: string; chat: VisitorChat }
  | { kind: "event"; at: string; label: string };

/**
 * Newest first: every chat, and the visitor's events from their own row's timestamps (no events
 * table — so the LATEST takeover, resolve and rating; an earlier takeover that was handed back
 * survives only in the transcript).
 */
function items(v: WidgetVisitor, chats: VisitorChat[]): Item[] {
  const face = v.rating ? RATING_FACES[v.rating - 1] : null;
  const last = chats.at(-1);
  const events: (Item | null)[] = [
    v.contact_submitted_at ? { kind: "event", at: v.contact_submitted_at, label: "Shared their name and email" } : null,
    v.handoff_requested_at ? { kind: "event", at: v.handoff_requested_at, label: "Asked to talk to a person" } : null,
    v.handled_at && v.handled_by_name ? { kind: "event", at: v.handled_at, label: `${v.handled_by_name} took over from the AI` } : null,
    v.summary_sent_at
      ? { kind: "event", at: v.summary_sent_at, label: last?.summary?.title ? `Summary emailed for “${last.summary.title}”` : "Summary emailed" }
      : null,
    v.rated_at && face ? { kind: "event", at: v.rated_at, label: `Rated the chat ${face.emoji} ${face.label}` } : null,
    v.resolved_at ? { kind: "event", at: v.resolved_at, label: `Resolved${v.resolved_by_name ? ` by ${v.resolved_by_name}` : ""}` } : null,
  ];
  return [...chats.map((chat): Item => ({ kind: "chat", at: chat.started_at, chat })), ...events.filter((e): e is Item => !!e)]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function ChatEntry({ chat }: Readonly<{ chat: VisitorChat }>) {
  const [open, setOpen] = useState(false);
  const text = chat.summary?.text;
  return (
    <>
      <p className="text-sm font-semibold text-foreground">{chatTitle(chat)}</p>
      <p className="text-xs text-muted-foreground">
        {dayTime(chat.started_at)}
        {chat.ended_at ? ` – ${new Date(chat.ended_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
      </p>
      <div className="mt-1.5 flex flex-col gap-1.5 rounded-lg border bg-muted/30 px-3 py-2.5">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
              chat.ended_at ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-700",
            )}
          >
            {chat.ended_at ? "Ended" : "In progress"}
          </span>
          {chat.message_count} message{chat.message_count === 1 ? "" : "s"}
          {chat.summary?.generated_at && <span>· summary updated {relativeTime(chat.summary.generated_at)}</span>}
        </p>
        {text ? (
          <>
            <p className={cn("text-[13px] leading-relaxed text-foreground", !open && "line-clamp-2")}>
              <Emphasised text={text} />
            </p>
            <button type="button" className="w-fit text-xs font-medium text-primary hover:underline" onClick={() => setOpen((o) => !o)}>
              {open ? "Less" : "More"}
            </button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No summary yet — it appears after the first real exchange.</p>
        )}
      </div>
    </>
  );
}

export function ActivityTimeline({ visitor, chats }: Readonly<{ visitor: WidgetVisitor; chats: VisitorChat[] }>) {
  return (
    <SectionCard icon={Activity} title="Activity">
      <ol className="flex flex-col gap-4 border-l border-border pl-4">
        {items(visitor, chats).map((item) => (
          <li key={item.kind === "chat" ? `c${item.chat.id}` : `${item.label}-${item.at}`} className="relative">
            {item.kind === "chat" ? (
              <>
                <span className="absolute -left-[23px] top-1 size-3 rounded-full border-[3px] border-primary bg-card" aria-hidden />
                <ChatEntry chat={item.chat} />
              </>
            ) : (
              <>
                <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                <p className="text-sm text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{relativeTime(item.at)}</p>
              </>
            )}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
