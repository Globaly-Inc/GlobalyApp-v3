"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SHORTCUTS, SIDEBAR_LABEL, SIDEBAR_ROW, SIDEBAR_ROW_ACTIVE, SIDEBAR_ROW_IDLE } from "./const";
import type { ActiveView, ShortcutType } from "./ui-types";

/**
 * The SHORTCUTS block from GlobalyOS V2's `ChatSidebar` — same uppercase label, same
 * row geometry, same left-border active state, same count badges (destructive for
 * unread, secondary for drafts).
 */
export function ShortcutsNav({
  active,
  unreadCount,
  draftCount,
  onSelect,
}: Readonly<{
  active: ActiveView;
  unreadCount: number;
  draftCount: number;
  onSelect: (type: ShortcutType) => void;
}>) {
  // Only Unread and Drafts carry a badge, exactly as in V2 — Starred has none there,
  // and a count for it would have to be fetched before the view is ever opened.
  const counts: Partial<Record<ShortcutType, number>> = { unread: unreadCount, drafts: draftCount };
  return (
    <div className="px-3 py-3">
      <p className={cn(SIDEBAR_LABEL, "mb-2 px-2")}>Shortcuts</p>
      <div className="space-y-0.5">
        {SHORTCUTS.map(({ type, label, icon: Icon }) => {
          const isActive = active.type === type;
          const count = counts[type] ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className={cn(SIDEBAR_ROW, "cursor-pointer", isActive ? SIDEBAR_ROW_ACTIVE : SIDEBAR_ROW_IDLE)}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
              {count > 0 && (
                <Badge
                  variant={type === "unread" ? "destructive" : "secondary"}
                  className="ml-auto h-5 min-w-5 px-1.5 text-[10px]"
                >
                  {count > 99 ? "99+" : count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
