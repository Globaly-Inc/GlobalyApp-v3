"use client";

import Link from "next/link";
import { RadioTower, Settings, WifiOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";
import { CHANNELS_HREF, INBOX_CHANNELS } from "../const";
import { ChannelGlyph } from "./channel-glyph";
import { WidgetSwitch } from "./widget-switch";

/**
 * Above the Inbox, as in GlobalyOS's Support Inbox: the widget switch, channels, and widget
 * settings — plus a small status chip per connected WhatsApp / Instagram / Facebook account, so a
 * lost connection is visible from the Inbox, not only on the Channels page.
 */
export function InboxChannelBar() {
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
        {connections.map((c) => (
          <Link
            key={c.id}
            href={CHANNELS_HREF}
            title={`${INBOX_CHANNELS[c.channel].label}: ${c.status === "connected" ? "connected" : "connection lost"}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-1 pr-2.5 text-xs hover:bg-muted"
          >
            <ChannelGlyph channel={c.channel} size="xs" />
            {INBOX_CHANNELS[c.channel].label}
            <span className={cn("size-1.5 rounded-full", c.status === "connected" ? "bg-emerald-500" : "bg-red-500")} />
            <span className="text-muted-foreground">
              {c.status !== "connected" ? "Reconnect" : c.ai_mode === "auto" ? "AI active" : "Suggest only"}
            </span>
          </Link>
        ))}
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
        <p className="border-t border-border bg-amber-500/10 px-4 py-1.5 text-xs text-amber-900">
          The chat widget is off. It&apos;s hidden on your website and visitors can&apos;t send messages. Past conversations stay here.
        </p>
      )}
    </div>
  );
}
