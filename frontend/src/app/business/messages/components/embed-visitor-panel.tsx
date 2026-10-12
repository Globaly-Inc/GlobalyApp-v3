"use client";

import Link from "next/link";
import { visitorHref } from "@/app/business/ai-widget/const";
import { User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fullStamp, messageTime, previewText } from "@/components/chat/utils";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/hooks";
import { CONVERSATION_STATE_LABELS, SUMMARY_STATUS_LABELS, VISITOR_STATUS_BADGE } from "@/app/business/ai-widget/const";
import { visitorDisplayName, visitorInitials, visitorNationality } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { INBOX_CHANNELS } from "../const";
import { channelOf, embedChatPill, embedChatState } from "../utils";
import { ChannelGlyph } from "./channel-glyph";
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
 * The customer beside their conversation, laid out like the omnichannel mock: who is answering
 * (with the takeover controls), the channel they wrote on, what they told us, what the AI has
 * picked up, and the team's notes. Everything comes from data already loaded for the open chat.
 *
 * ponytail: one conversation = one visitor row. The mock's cross-channel parts ("one profile across
 * 3 channels", history across channels) need contact linking (plan phase 6).
 */
export function EmbedVisitorPanel({ visitor, actions }: Readonly<{ visitor: WidgetVisitor; actions: EmbedChatActions }>) {
  const notes = useAppSelector((s) => s.embedChats.notes[visitor.id]);
  const badge = VISITOR_STATUS_BADGE[visitor.status];
  const pill = embedChatPill(visitor);
  const state = embedChatState(visitor);
  const channel = channelOf(visitor);
  const testCount = (visitor.language_tests?.length ?? 0) + (visitor.academic_tests?.length ?? 0);
  const known = [
    visitor.study_preference && `Interested in: ${visitor.study_preference}`,
    count(visitor.qualifications?.length, "qualification", "qualifications"),
    count(testCount, "test score", "test scores"),
    count(visitor.work_experiences?.length, "job", "jobs"),
  ].filter((k): k is string => !!k);

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
        <Link href={visitorHref(visitor.id)} className="text-xs font-medium text-primary hover:underline">
          Open full visitor record →
        </Link>
      </div>

      <Section title="Current conversation">
        <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-xs font-medium", pill.className)}>
          {state === "human" && visitor.handled_by_name && !visitor.handled_by_me ? visitor.handled_by_name : pill.label}
        </span>
        <EmbedChatControls visitor={visitor} actions={actions} stacked />
      </Section>

      <Section title="Channel">
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
          <ChannelGlyph channel={channel} size="sm" />
          <span className="font-medium text-foreground">{INBOX_CHANNELS[channel].label}</span>
          <span className="ml-auto truncate text-muted-foreground">
            {channel === "ai_embed" ? "Website visitor" : visitor.channel_handle}
          </span>
        </div>
      </Section>

      <Section title="Customer">
        <Rows
          rows={[
            ["Email", visitor.email && <a href={`mailto:${visitor.email}`} className="hover:underline">{visitor.email}</a>],
            ["Phone", visitor.phone],
            ["Age", visitor.age],
            ["Gender", visitor.gender && <span className="capitalize">{visitor.gender}</span>],
            ["Nationality", visitorNationality(visitor)],
            ["Interested in", visitor.study_preference],
          ]}
        />
      </Section>

      <Section title="What AI knows">
        {known.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing picked up yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {known.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground">
                <ChannelGlyph channel={channel} size="xs" />
                {k}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Internal notes">
        {notes?.length ? (
          [...notes].reverse().map((n) => (
            <div key={n.id} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs">
              <p className="text-foreground">{previewText(n.content) || "Attachment"}</p>
              <p className="mt-1 text-[11px] text-amber-800">{n.author_name} · {messageTime(n.created_at)}</p>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No notes yet. Add one from the Note tab under the chat.</p>
        )}
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
