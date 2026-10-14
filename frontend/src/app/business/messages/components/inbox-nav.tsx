"use client";

import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen, Star, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { visitorDisplayName, visitorInitials } from "@/app/business/ai-widget/utils";
import { INBOX_VIEWS, type InboxView } from "../const";
import { channelOf, inChannel, matchesView } from "../utils";
import { ChannelGlyph } from "./channel-glyph";
import type { ChannelFilter } from "./channel-picker";

// Collapsed or open is a per-viewer convenience: remembered in this browser when storage works,
// and still toggles (for this visit) when it doesn't.
const NAV_KEY = "inbox-nav-collapsed";
let collapsedMemo: boolean | null = null;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const readCollapsed = () => {
  if (collapsedMemo !== null) return collapsedMemo;
  try { return localStorage.getItem(NAV_KEY) === "1"; } catch { return false; }
};
function setCollapsed(value: boolean) {
  collapsedMemo = value;
  try { localStorage.setItem(NAV_KEY, value ? "1" : "0"); } catch { /* private window: this visit only */ }
  listeners.forEach((l) => l());
}
export const useNavCollapsed = () => useSyncExternalStore(subscribe, readCollapsed, () => false);

function Count({ value, hot, mini }: Readonly<{ value: number; hot?: boolean; mini?: boolean }>) {
  if (!value && mini) return null;
  return (
    <span
      className={cn(
        "grid h-[18px] min-w-5 place-items-center rounded-full px-1.5 text-xs font-medium tabular-nums",
        hot && value ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground",
        mini && "absolute -right-0.5 top-0 h-4 min-w-4 px-1 text-xs",
      )}
    >
      {value}
    </span>
  );
}

const ITEM = "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted";
const ITEM_ON = "bg-primary/10 font-semibold text-primary hover:bg-primary/10";
const ITEM_MINI = "size-10 justify-center px-0";

/** Starred has its own section below, listing the conversations themselves. */
const NAV_VIEWS = INBOX_VIEWS.filter((v) => v.value !== "starred");

/**
 * The Inbox's own sidebar: views (Needs attention first), each with a count, then the starred
 * conversations themselves (the channel filter lives in the bar above). It collapses to an icon
 * rail — counts become badges, starred conversations become avatars — and opens again.
 */
export function InboxNav({
  visitors, view, onView, channel, activeId, onOpen,
}: Readonly<{
  visitors: WidgetVisitor[];
  view: InboxView;
  onView: (view: InboxView) => void;
  /** Views count within the channel picked in the bar. */
  channel: ChannelFilter;
  activeId: number | null;
  onOpen: (visitorId: number) => void;
}>) {
  const mini = useNavCollapsed();
  const viewCount = (v: InboxView) => visitors.filter((x) => inChannel(x, channel) && matchesView(x, v)).length;
  // ponytail: starred among the loaded list (the list's own page), newest first.
  const starred = visitors.filter((v) => v.starred).sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at));
  const Toggle = mini ? PanelLeftOpen : PanelLeftClose;

  return (
    <nav
      aria-label="Inbox views"
      className={cn("hidden shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-card p-2 md:flex", mini ? "w-[60px] items-center" : "w-56")}
    >
      <div className={cn("flex items-center pb-2", mini ? "justify-center" : "pl-2.5")}>
        {!mini && <span className="font-semibold text-foreground">Inbox</span>}
        <button
          type="button"
          onClick={() => setCollapsed(!mini)}
          aria-label={mini ? "Open sidebar" : "Collapse sidebar"}
          title={mini ? "Open sidebar" : "Collapse sidebar"}
          className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground", !mini && "ml-auto")}
        >
          <Toggle className="size-4" aria-hidden />
        </button>
      </div>

      {NAV_VIEWS.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" title={label} aria-pressed={view === value} onClick={() => onView(value)} className={cn(ITEM, view === value && ITEM_ON, mini && ITEM_MINI)}>
          <Icon className={cn("size-4 shrink-0", view === value ? "text-primary" : "text-muted-foreground")} aria-hidden />
          {!mini && <span className="min-w-0 flex-1 truncate">{label}</span>}
          <Count value={viewCount(value)} hot={value === "attention"} mini={mini} />
        </button>
      ))}

      {mini ? (
        <span className="my-2 h-px w-7 bg-border" />
      ) : (
        <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-4">
          <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
          <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Starred</p>
          {/* Always there: the loaded page (or a search) may hold none of the starred chats. */}
          <button type="button" onClick={() => onView("starred")} className={cn("text-xs font-medium text-primary hover:underline", view === "starred" && "underline")}>
            See all
          </button>
        </div>
      )}

      {starred.map((v) => {
        const name = visitorDisplayName(v);
        const unread = v.unread_count ?? 0;
        return (
          <button key={v.id} type="button" title={name} onClick={() => onOpen(v.id)} className={cn(ITEM, activeId === v.id && ITEM_ON, mini && ITEM_MINI)}>
            <span className="relative shrink-0">
              <Avatar className="size-6">
                <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                  {v.name ? visitorInitials(v) : <User className="size-3" aria-hidden />}
                </AvatarFallback>
              </Avatar>
              <ChannelGlyph channel={channelOf(v)} size="xs" className="absolute -bottom-1 -right-1 size-3 ring-1 ring-card [&_svg]:size-2" />
            </span>
            {!mini && <span className={cn("min-w-0 flex-1 truncate", !v.name && "italic")}>{name}</span>}
            {unread > 0 && <Count value={unread} mini={mini} />}
          </button>
        );
      })}
      {!mini && starred.length === 0 && <p className="px-2.5 text-xs text-muted-foreground">None starred among these conversations.</p>}
    </nav>
  );
}
