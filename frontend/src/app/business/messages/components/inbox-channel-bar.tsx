"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Layers, RadioTower, Settings, WifiOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchEmbedConfigs } from "@/app/business/ai-widget/store/ai-widget-slice";
import { cn } from "@/lib/utils";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";
import type { InboxChannel } from "@/app/business/ai-widget/apis/types";
import { CHANNELS_HREF, INBOX_CHANNELS, INBOX_CHANNEL_ORDER } from "../const";
import { ChannelGlyph } from "./channel-glyph";
import { HEALTH_DOT, type ChannelFilter, type ChannelHealth } from "./channel-picker";


/** The channel filter, one chip per channel with its connection dot and count. A channel that
 *  isn't connected (or the widget, when off) still filters while it has past conversations; with
 *  none, it links to where it's set up ("Connect a channel" is always beside it too). */
export type ChannelChips = {
  channel: ChannelFilter;
  onChannel: (c: ChannelFilter) => void;
  count: (c: ChannelFilter) => number;
  health: Partial<Record<InboxChannel, ChannelHealth>>;
};

// The same size and shape as the Widget button on the right.
const CHIP = cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 pl-1.5");

function Chips({ channel, onChannel, count, health }: Readonly<ChannelChips>) {
  return (
    <div role="group" aria-label="Channels" className="flex flex-wrap items-center gap-1.5">
      {(["all", ...INBOX_CHANNEL_ORDER] as ChannelFilter[]).map((c) => {
        const on = channel === c;
        const label = c === "all" ? "All channels" : INBOX_CHANNELS[c].label;
        const state = c === "all" ? null : (health[c] ?? "off");
        const n = count(c);
        const body = (
          <>
            {c === "all" ? (
              <span className="inline-flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground"><Layers className="size-3" aria-hidden /></span>
            ) : (
              <ChannelGlyph channel={c} size="sm" />
            )}
            {label}
            {state && <span className={cn("size-1.5 rounded-full", HEALTH_DOT[state].className)} />}
            {(state !== "off" || n > 0) && <span className="font-normal tabular-nums text-muted-foreground">{n}</span>}
          </>
        );
        if (state === "off" && n === 0) {
          return (
            <Link key={c} href={c === "ai_embed" ? WIDGET_SETTINGS_HREF : CHANNELS_HREF} title={`${label}: not connected`} className={cn(CHIP, "border-dashed text-muted-foreground")}>
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
            className={cn(CHIP, on && "border-primary/30 bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary", state === "off" && !on && "border-dashed text-muted-foreground")}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Above the Inbox: the channel filter (each channel's connection dot and count), Connect a channel,
 * and widget settings. The widget's on/off switch lives on its settings and the Channels page, not
 * here. A lost connection also gets a banner, so it's visible from the Inbox, not only on Channels.
 */
export function InboxChannelBar({ chips }: Readonly<{ chips?: ChannelChips }>) {
  const dispatch = useAppDispatch();
  const { loaded: widgetLoaded, status: widgetStatus } = useAppSelector((s) => s.aiWidget);
  const widgetOff = useAppSelector((s) => s.aiWidget.configs.length === 1 && s.aiWidget.configs[0]?.is_active === false);
  // The Inbox needs the widget configs (its health dot, the paused-widget warning, the setup
  // dialog), and nothing else here loads them now the switch has left this bar. Keyed on `loaded`,
  // not a mount ref: switching org resets the slice under a mounted Inbox. The thunk's `condition`
  // absorbs Strict Mode's double run; a failed fetch isn't retried in a loop.
  useEffect(() => {
    if (widgetLoaded || widgetStatus === "failed") return;
    dispatch(fetchEmbedConfigs());
  }, [dispatch, widgetLoaded, widgetStatus]);
  const connections = useAppSelector((s) => s.inboxChannels.connections);
  const lost = connections.filter((c) => c.status === "error");
  return (
    <div className="shrink-0 border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {chips && <Chips {...chips} />}
        <Link href={CHANNELS_HREF} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 border-dashed")}>
          <RadioTower className="size-3.5" aria-hidden />
          Connect a channel
        </Link>
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
