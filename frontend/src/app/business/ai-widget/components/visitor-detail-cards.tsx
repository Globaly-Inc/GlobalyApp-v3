"use client";

import { Mail, MessageSquare, Sparkles, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
// Reused, not reimplemented: these are the exact cards the personal profile is built from, so
// the visitor page inherits its spacing, header rule, hover pencil and empty states for free.
import { Field, SectionCard } from "@/app/personal/profile/section-card";
import { relativeTime } from "@/components/feed/utils";
import {
  CONTACT_STATUS_LABELS, CONVERSATION_STATE_LABELS, SUMMARY_STATUS_LABELS, VISITOR_STATUS_BADGE,
} from "../const";
import type { WidgetVisitor } from "../apis/types";

/**
 * Every card on this page carries this. The fields below are not a profile the person filled
 * in — they are a model's reading of what a stranger said in a chat, so the page says so rather
 * than letting the profile styling imply a verified record.
 */
function SelfReported() {
  return <Badge variant="secondary" className="font-normal">Self-reported</Badge>;
}

/**
 * The scalar cards: who they are and how to reach them. The four record sections that follow
 * them on the page are their own component — they carry add/edit/delete, these do not.
 *
 * Date of birth, phone and address are absent because `ai_widget_visitors` has no such columns —
 * a chat visitor gives an age in words, if anything, and never an address. `age` is printed
 * exactly as stored for the same reason: there is no age-group list behind it, and "early 30s"
 * is a real value somebody gave.
 */
export function VisitorDetailCards({
  visitor,
  onEdit,
}: Readonly<{ visitor: WidgetVisitor; onEdit: () => void }>) {
  // Shows the resolved country and the visitor's own wording when the two differ, so a bad
  // resolution ("Kashmiri" → nothing, "Nepali" → Nepal) is visible rather than hidden.
  const nationality = visitor.nationality && visitor.nationality_raw && visitor.nationality_raw !== visitor.nationality
    ? `${visitor.nationality} (said “${visitor.nationality_raw}”)`
    : visitor.nationality ?? visitor.nationality_raw;

  return (
    <>
      <SectionCard icon={User} title="Personal Details" badge={<SelfReported />} onEdit={onEdit}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Field label="Full Name" value={visitor.name} />
          <Field label="Age" value={visitor.age} />
          <Field label="Gender" value={visitor.gender} />
          <Field label="Nationality" value={nationality} />
        </div>
      </SectionCard>

      <SectionCard icon={Mail} title="Contact Details" badge={<SelfReported />} onEdit={onEdit}>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <Field
            label="Email"
            value={visitor.email ? <a href={`mailto:${visitor.email}`} className="hover:underline">{visitor.email}</a> : null}
          />
          <Field label="Contact card" value={CONTACT_STATUS_LABELS[visitor.contact_status] ?? visitor.contact_status} />
        </div>
      </SectionCard>

    </>
  );
}

/** Sidebar: the one course they asked about, in the slot the personal profile gives preferences. */
export function VisitorPreferenceCard({
  visitor,
  onEdit,
}: Readonly<{ visitor: WidgetVisitor; onEdit: () => void }>) {
  return (
    <SectionCard icon={Sparkles} title="Study Preference" badge={<SelfReported />} onEdit={onEdit}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Course discussed
      </p>
      {visitor.study_preference ? (
        <Badge variant="secondary">{visitor.study_preference}</Badge>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </SectionCard>
  );
}

/**
 * Sidebar: what the widget itself recorded. No pencil — this is the machinery's account of what
 * happened, not something an owner may rewrite, and the backend rejects these fields outright.
 */
export function VisitorActivityCard({ visitor }: Readonly<{ visitor: WidgetVisitor }>) {
  const badge = VISITOR_STATUS_BADGE[visitor.status];
  return (
    <SectionCard icon={MessageSquare} title="Conversation">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Status" value={<Badge className={badge.className}>{badge.label}</Badge>} />
        <Field label="Messages" value={String(visitor.message_count)} />
        <Field label="First seen" value={relativeTime(visitor.first_seen_at)} />
        <Field label="Last activity" value={relativeTime(visitor.last_activity_at)} />
        <Field
          label="Conversation"
          value={CONVERSATION_STATE_LABELS[visitor.conversation_state] ?? visitor.conversation_state}
        />
        {visitor.summary_status && (
          <Field
            label="Chat summary"
            value={SUMMARY_STATUS_LABELS[visitor.summary_status] ?? visitor.summary_status}
          />
        )}
      </div>
    </SectionCard>
  );
}
