"use client";

import Link from "next/link";
import { MessageSquare, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fullStamp } from "@/components/chat/utils";
import { cn } from "@/lib/utils";
import { CONVERSATION_STATE_LABELS, SUMMARY_STATUS_LABELS, VISITOR_STATUS_BADGE } from "@/app/business/ai-widget/const";
import { visitorDisplayName, visitorInitials, visitorNationality } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { embedChatPill, embedChatState } from "../utils";
import { EmbedChatControls } from "./embed-chat-controls";
import type { EmbedChatActions } from "./use-embed-chat-actions";

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Label/value rows; a row with no value is left out rather than shown as a dash. */
function Rows({ rows }: Readonly<{ rows: [string, React.ReactNode][] }>) {
  const shown = rows.filter(([, value]) => value);
  if (shown.length === 0) return <p className="text-xs text-muted-foreground">Nothing shared yet.</p>;
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1.5 text-xs">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const count = (n: number | undefined, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);

/**
 * The visitor beside their conversation: who is answering (with the takeover controls), what they
 * told the assistant, and when things happened. Everything comes from the list row already
 * loaded, so opening a chat costs no extra request; the full, editable record is one link away.
 */
export function EmbedVisitorPanel({ visitor, actions }: Readonly<{ visitor: WidgetVisitor; actions: EmbedChatActions }>) {
  const badge = VISITOR_STATUS_BADGE[visitor.status];
  const pill = embedChatPill(visitor);
  const state = embedChatState(visitor);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Avatar className="size-14">
          <AvatarFallback className="bg-primary/10 text-base font-medium text-primary">
            {visitor.name ? visitorInitials(visitor) : <User className="size-6" aria-hidden />}
          </AvatarFallback>
        </Avatar>
        <p className={cn("font-semibold text-foreground", !visitor.name && "italic")}>{visitorDisplayName(visitor)}</p>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", badge.className)}>{badge.label}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="size-3 text-primary" aria-hidden /> Web widget
        </span>
      </div>

      <Section title="Handled by">
        <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-xs font-medium", pill.className)}>
          {state === "human" && visitor.handled_by_name && !visitor.handled_by_me ? visitor.handled_by_name : pill.label}
        </span>
        <EmbedChatControls visitor={visitor} actions={actions} stacked />
      </Section>

      <Section title="Contact">
        <Rows
          rows={[
            ["Email", visitor.email && <a href={`mailto:${visitor.email}`} className="hover:underline">{visitor.email}</a>],
            ["Age", visitor.age],
            ["Gender", visitor.gender && <span className="capitalize">{visitor.gender}</span>],
            ["Nationality", visitorNationality(visitor)],
          ]}
        />
      </Section>

      <Section title="Study preference">
        <Rows rows={[["Interested in", visitor.study_preference]]} />
      </Section>

      <Section title="Profile">
        <Rows
          rows={[
            ["Education", count(visitor.qualifications?.length, "qualification", "qualifications")],
            ["Tests", count((visitor.language_tests?.length ?? 0) + (visitor.academic_tests?.length ?? 0), "test", "tests")],
            ["Work", count(visitor.work_experiences?.length, "role", "roles")],
          ]}
        />
        <Link href={`/business/ai-widget/visitors/${visitor.id}`} className="text-xs font-medium text-primary hover:underline">
          Open full visitor record →
        </Link>
      </Section>

      <Section title="Timeline">
        <Rows
          rows={[
            ["First seen", fullStamp(visitor.first_seen_at)],
            ["Last activity", fullStamp(visitor.last_activity_at)],
            // handled_at moves with every staff reply — it's what the 15-minute hand-back counts from.
            ["Staff active", state === "human" && visitor.handled_at ? fullStamp(visitor.handled_at) : null],
            ["Resolved", visitor.resolved_at && `${fullStamp(visitor.resolved_at)}${visitor.resolved_by_name ? ` · ${visitor.resolved_by_name}` : ""}`],
            ["Chat", CONVERSATION_STATE_LABELS[visitor.conversation_state]],
            ["Summary email", visitor.summary_status && SUMMARY_STATUS_LABELS[visitor.summary_status]],
          ]}
        />
      </Section>
    </div>
  );
}
