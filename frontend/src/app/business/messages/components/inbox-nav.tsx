"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Layers, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InboxChannel, WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { CHANNELS_HREF, INBOX_CHANNELS, INBOX_CHANNEL_ORDER, INBOX_VIEWS, type InboxView } from "../const";
import { inChannel, matchesView } from "../utils";
import { ChannelGlyph } from "./channel-glyph";
import { HEALTH_DOT, type ChannelFilter, type ChannelHealth } from "./channel-picker";

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
        "grid h-[18px] min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
        hot && value ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground",
        mini && "absolute -right-0.5 top-0 h-4 min-w-4 px-1 text-[9.5px]",
      )}
    >
      {value}
    </span>
  );
}

const ITEM = "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted";
const ITEM_ON = "bg-primary/10 font-semibold text-primary hover:bg-primary/10";
const ITEM_MINI = "size-10 justify-center px-0";

/**
 * The Inbox's own sidebar: views (Needs attention first) and channels, each with a count. It
 * collapses to an icon rail — counts become badges, channels keep their health dots — and opens again.
 */
export function InboxNav({
  visitors, view, onView, channel, onChannel, health,
}: Readonly<{
  visitors: WidgetVisitor[];
  view: InboxView;
  onView: (view: InboxView) => void;
  channel: ChannelFilter;
  onChannel: (channel: ChannelFilter) => void;
  health: Partial<Record<InboxChannel, ChannelHealth>>;
}>) {
  const mini = useNavCollapsed();
  // Counts follow the other choice: views count within the channel, channels within the view.
  const viewCount = (v: InboxView) => visitors.filter((x) => inChannel(x, channel) && matchesView(x, v)).length;
  const channelCount = (c: ChannelFilter) => visitors.filter((x) => inChannel(x, c) && matchesView(x, view)).length;
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

      {INBOX_VIEWS.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" title={label} aria-pressed={view === value} onClick={() => onView(value)} className={cn(ITEM, view === value && ITEM_ON, mini && ITEM_MINI)}>
          <Icon className={cn("size-4 shrink-0", view === value ? "text-primary" : "text-muted-foreground")} aria-hidden />
          {!mini && <span className="min-w-0 flex-1 truncate">{label}</span>}
          <Count value={viewCount(value)} hot={value === "attention"} mini={mini} />
        </button>
      ))}

      {mini ? <span className="my-2 h-px w-7 bg-border" /> : <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Channels</p>}

      {(["all", ...INBOX_CHANNEL_ORDER] as ChannelFilter[]).map((c) => {
        const label = c === "all" ? "All channels" : INBOX_CHANNELS[c].label;
        const dot = c === "all" ? null : HEALTH_DOT[health[c] ?? "off"];
        return (
          <button key={c} type="button" title={label} aria-pressed={channel === c} onClick={() => onChannel(c)} className={cn(ITEM, channel === c && ITEM_ON, mini && ITEM_MINI)}>
            {c === "all" ? (
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Layers className="size-3.5" aria-hidden /></span>
            ) : (
              <ChannelGlyph channel={c} size="md" />
            )}
            {!mini && <span className="min-w-0 flex-1 truncate">{label}</span>}
            {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dot.className, mini && "absolute bottom-2 right-2 ring-2 ring-card")} title={dot.title} />}
            {!mini && <Count value={channelCount(c)} />}
          </button>
        );
      })}

      {!mini && (
        <Link href={CHANNELS_HREF} className="mt-3 px-2.5 text-xs font-medium text-primary hover:underline">
          + Connect a channel
        </Link>
      )}
    </nav>
  );
}
