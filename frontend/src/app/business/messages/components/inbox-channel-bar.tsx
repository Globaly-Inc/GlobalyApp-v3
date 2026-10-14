"use client";

import Link from "next/link";
import { Layers, RadioTower, Settings, WifiOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";
import type { InboxChannel } from "@/app/business/ai-widget/apis/types";
import { CHANNELS_HREF, INBOX_CHANNELS, INBOX_CHANNEL_ORDER } from "../const";
import { ChannelGlyph } from "./channel-glyph";
import { HEALTH_DOT, type ChannelFilter, type ChannelHealth } from "./channel-picker";
import { WidgetSwitch } from "./widget-switch";

const CHIP = "inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2.5 text-xs transition-colors";

/** The channel filter, one chip per channel with its connection dot and count. A channel that
 *  isn't connected (or the widget, when off) goes to where it's set up instead of filtering. */
export type ChannelChips = {
  channel: ChannelFilter;
  onChannel: (c: ChannelFilter) => void;
  count: (c: ChannelFilter) => number;
  health: Partial<Record<InboxChannel, ChannelHealth>>;
};

function Chips({ channel, onChannel, count, health }: Readonly<ChannelChips>) {
  return (
    <div role="group" aria-label="Channels" className="flex flex-wrap items-center gap-1.5">
      {(["all", ...INBOX_CHANNEL_ORDER] as ChannelFilter[]).map((c) => {
        const on = channel === c;
        const label = c === "all" ? "All channels" : INBOX_CHANNELS[c].label;
        const state = c === "all" ? null : (health[c] ?? "off");
        const body = (
          <>
            {c === "all" ? (
              <span className="inline-flex size-4 items-center justify-center rounded bg-muted text-muted-foreground"><Layers className="size-2.5" aria-hidden /></span>
            ) : (
              <ChannelGlyph channel={c} size="xs" />
            )}
            {label}
            {state && <span className={cn("size-1.5 rounded-full", HEALTH_DOT[state].className)} />}
            {state !== "off" && <span className="tabular-nums text-muted-foreground">{count(c)}</span>}
          </>
        );
        if (state === "off") {
          return (
            <Link key={c} href={c === "ai_embed" ? WIDGET_SETTINGS_HREF : CHANNELS_HREF} title={`${label}: not connected`} className={cn(CHIP, "border-dashed text-muted-foreground hover:bg-muted")}>
              {body}
            </Link>
          );
        }
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            title={state ? `${label}: ${HEALTH_DOT[state].title.toLowerCase()}` : label}
            onClick={() => onChannel(c)}
            className={cn(CHIP, on ? "border-primary/30 bg-primary/10 font-medium text-primary" : "border-border hover:bg-muted")}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Above the Inbox, as in GlobalyOS's Support Inbox: the widget switch, Connect a channel, the
 * channel filter (with each channel's connection dot), and widget settings. A lost connection
 * also gets a banner, so it's visible from the Inbox, not only on the Channels page.
 */
export function InboxChannelBar({ chips }: Readonly<{ chips?: ChannelChips }>) {
  const widgetOff = useAppSelector((s) => s.aiWidget.configs.length === 1 && s.aiWidget.configs[0]?.is_active === false);
  const connections = useAppSelector((s) => s.inboxChannels.connections);
  const lost = connections.filter((c) => c.status === "error");
  return (
    <div className="shrink-0 border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <WidgetSwitch />
        <Link href={CHANNELS_HREF} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 border-dashed")}>
          <RadioTower className="size-3.5" aria-hidden />
          Connect a channel
        </Link>
        {chips && (
          <>
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
            <Chips {...chips} />
          </>
        )}
        {/* The only way to the widget's settings — "AI embed" left the Settings menu. */}
        <Link href={WIDGET_SETTINGS_HREF} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto gap-1.5")}>
          <Settings className="size-3.5" aria-hidden />
          Widget
        </Link>
      </div>
      {lost.map((c) => (
        <p key={c.id} className="flex items-center gap-2 border-t border-border bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          <WifiOff className="size-3.5" aria-hidden />
          <span className="flex-1">
            <b>{INBOX_CHANNELS[c.channel].label} connection lost.</b> AI responses may be interrupted until it&apos;s reconnected.
          </span>
          <Link href={CHANNELS_HREF} className="font-semibold underline">Reconnect</Link>
        </p>
      ))}
      {widgetOff && (
        <p className="border-t border-border bg-warning/10 px-4 py-1.5 text-xs text-warning">
          The chat widget is off. It&apos;s hidden on your website and visitors can&apos;t send messages. Past conversations stay here.
        </p>
      )}
    </div>
  );
}
