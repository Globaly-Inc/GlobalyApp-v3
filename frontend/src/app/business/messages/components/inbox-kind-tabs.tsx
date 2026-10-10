"use client";

import { cn } from "@/lib/utils";

/** Which conversations the Inbox lists. */
export type InboxKind = "all" | "enquiry" | "embed";

const KINDS: ReadonlyArray<{ value: InboxKind; label: string }> = [
  { value: "all", label: "All" },
  { value: "enquiry", label: "Enquiries" },
  { value: "embed", label: "AI Conversations" },
];

/**
 * The segmented switch under the sidebar search: a muted track with the active side raised
 * onto the card, each label carrying its conversation count — filled navy when active.
 */
export function InboxKindTabs({
  value,
  onChange,
  counts,
}: Readonly<{ value: InboxKind; onChange: (kind: InboxKind) => void; counts: Record<InboxKind, number> }>) {
  return (
    <div role="tablist" aria-label="Conversation type" className="mt-3 flex rounded-xl bg-muted p-1">
      {KINDS.map(({ value: kind, label }) => {
        const active = kind === value;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(kind)}
            className={cn(
              "flex flex-auto cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-semibold transition-colors",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span
              className={cn(
                "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                active ? "bg-primary text-primary-foreground" : "bg-muted-foreground/10 text-muted-foreground",
              )}
            >
              {counts[kind] > 99 ? "99+" : counts[kind]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
