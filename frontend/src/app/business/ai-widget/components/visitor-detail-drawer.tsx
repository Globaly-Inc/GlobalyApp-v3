"use client";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { relativeTime } from "@/components/feed/utils";
import {
  CONTACT_STATUS_LABELS, CONVERSATION_STATE_LABELS, SUMMARY_STATUS_LABELS,
  VISITOR_PROFILE_SECTIONS, VISITOR_STATUS_BADGE,
} from "../const";
import { profilePairs, visitorDisplayName } from "../utils";
import type { WidgetVisitor } from "../apis/types";

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

/**
 * Everything the widget recorded about one person, read-only.
 *
 * Read-only is the point, not a shortcut: the conversation is the source of truth for this row,
 * so an owner editing a name here would put the list out of step with what the visitor actually
 * said — and the status is derived from those very fields, so an edit would silently promote or
 * demote someone. Changes come from the chat.
 */

/**
 * The scalar attributes the visitor stated, as label/value pairs, skipping the ones they never
 * mentioned — which for most visitors is all of them.
 *
 * `age` is printed exactly as stored. It is not a bucket and must not be rendered as a range:
 * there is no age-group list behind it, and "early 30s" is a value a real visitor gave.
 *
 * Nationality shows the resolved country, and appends the visitor's own wording when it differed
 * — so a reader can see that "Nepal" came from "Nepali", and can tell that apart from a wording
 * that matched no country at all, where only the raw is stored.
 */
function statedAttributes(v: WidgetVisitor): Array<{ label: string; value: string }> {
  const nationality = v.nationality && v.nationality_raw && v.nationality_raw !== v.nationality
    ? `${v.nationality} (said “${v.nationality_raw}”)`
    : v.nationality ?? v.nationality_raw;

  return [
    { label: "Age", value: v.age },
    { label: "Gender", value: v.gender },
    { label: "Nationality", value: nationality },
    { label: "Study preference", value: v.study_preference },
  ].filter((a): a is { label: string; value: string } => !!a.value);
}

export function VisitorDetailDrawer({
  visitor,
  onOpenChange,
}: Readonly<{ visitor: WidgetVisitor | null; onOpenChange: (open: boolean) => void }>) {
  const badge = visitor ? VISITOR_STATUS_BADGE[visitor.status] : null;
  const attributes = visitor ? statedAttributes(visitor) : [];

  return (
    <Sheet open={!!visitor} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {visitor && badge && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {visitorDisplayName(visitor)}
                <Badge className={badge.className}>{badge.label}</Badge>
              </SheetTitle>
              <SheetDescription>
                {visitor.email ?? "This visitor never shared an email address."}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <section className="divide-y">
                <Row label="Messages" value={String(visitor.message_count)} />
                <Row label="Conversation" value={CONVERSATION_STATE_LABELS[visitor.conversation_state] ?? visitor.conversation_state} />
                <Row label="Contact details" value={CONTACT_STATUS_LABELS[visitor.contact_status] ?? visitor.contact_status} />
                <Row label="First seen" value={relativeTime(visitor.first_seen_at)} />
                <Row label="Last activity" value={relativeTime(visitor.last_activity_at)} />
                {visitor.summary_status && (
                  <Row
                    label="Chat summary"
                    value={SUMMARY_STATUS_LABELS[visitor.summary_status] ?? visitor.summary_status}
                  />
                )}
              </section>

              {/* Labelled as self-reported everywhere it appears. It is a model's reading of an
                  anonymous stranger's prose — a lead signal, never a record to act on. */}
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">What they told the assistant</h3>
                  <p className="text-xs text-muted-foreground">
                    Self-reported during the chat and not verified.
                  </p>
                </div>

                {/* The four scalars share the arrays' provenance, so they sit under the same
                    "self-reported, not verified" heading rather than up with the hard facts. */}
                {attributes.length > 0 && (
                  <section className="divide-y">
                    {attributes.map((a) => (
                      <Row key={a.label} label={a.label} value={a.value} />
                    ))}
                  </section>
                )}

                {/* Must count the scalars too. Checking only the arrays claimed "nothing came up"
                    for a visitor who had given their age and nationality and nothing else. */}
                {attributes.length === 0 && VISITOR_PROFILE_SECTIONS.every((s) => !visitor[s.key]?.length) && (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Nothing about their background came up.
                  </p>
                )}

                {VISITOR_PROFILE_SECTIONS.map((section) => {
                  const entries = visitor[section.key];
                  if (!entries?.length) return null;
                  return (
                    <div key={section.key} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.label}
                      </p>
                      {entries.map((entry, i) => (
                        <div key={`${section.key}-${i}`} className="rounded-lg border p-3">
                          {profilePairs(entry).map((pair) => (
                            <Row key={pair.label} label={pair.label} value={pair.value} />
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
