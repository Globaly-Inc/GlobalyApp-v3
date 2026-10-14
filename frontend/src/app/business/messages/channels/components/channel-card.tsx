"use client";

import { AtSign, Bot, Building2, Gauge, Link2, Phone, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChannelGlyph } from "../../components/channel-glyph";
import { INBOX_CHANNELS } from "../../const";
import type { ChannelConnection, ChannelKey } from "../apis/types";

const HANDLE_ICON = { whatsapp: Phone, instagram: AtSign, facebook: Link2 } as const;

/**
 * One channel on the Channels page, in the existing card layout: dashed with Connect until it is
 * connected; solid with the account, AI status and actions after; red when Meta ended it.
 */
export function ChannelCard({
  channel, description, connection, disabled, onConnect, onReconnect, onConfigure, onDisconnect,
}: Readonly<{
  channel: ChannelKey;
  description: string;
  connection: ChannelConnection | undefined;
  /** No Zernio key on the server yet: Connect can't work. */
  disabled: boolean;
  onConnect: () => void;
  onReconnect: (c: ChannelConnection) => void;
  onConfigure: (c: ChannelConnection) => void;
  onDisconnect: (c: ChannelConnection) => void;
}>) {
  const label = INBOX_CHANNELS[channel].label;
  if (!connection) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-card p-4">
        <ChannelGlyph channel={channel} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button size="sm" className="shrink-0" disabled={disabled} onClick={onConnect}>Connect</Button>
      </div>
    );
  }

  const lost = connection.status === "error";
  const HandleIcon = HANDLE_ICON[channel];
  const red = connection.quality?.toLowerCase() === "red";
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border bg-card p-4", lost ? "border-destructive/40" : "border-border")}>
      <ChannelGlyph channel={channel} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
          {label}
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", lost ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
            <span className={cn("size-1.5 rounded-full", lost ? "bg-destructive" : "bg-success")} />
            {lost ? "Connection lost" : "Connected"}
          </span>
        </p>
        <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Building2 className="size-3.5" aria-hidden />{connection.display_name}</span>
          {connection.handle && <span className="flex items-center gap-1.5"><HandleIcon className="size-3.5" aria-hidden />{connection.handle}</span>}
          <span className="flex items-center gap-1.5"><Bot className="size-3.5" aria-hidden />{connection.ai_mode === "auto" ? "AI active · responds automatically" : "AI suggests replies only"}</span>
          {channel === "whatsapp" && connection.quality && (
            <span className="flex items-center gap-1.5">
              <Gauge className="size-3.5" aria-hidden />
              Quality: <b className={cn("font-medium capitalize", red ? "text-destructive" : "text-success")}>{connection.quality.toLowerCase()}</b>
            </span>
          )}
        </div>
        {red && !lost && (
          <p className="mt-2 flex gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span><b>Meta rated your WhatsApp quality red.</b> Too many customers blocked or reported recent messages, so Meta may limit sending. AI keeps replying to customers who write first.</span>
          </p>
        )}
        {lost && (
          <div className="mt-2 flex flex-col items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <span><b>{label} connection lost.</b> {connection.error_message ?? "AI responses may be interrupted."}</span>
            <Button size="sm" variant="destructive" disabled={disabled} onClick={() => onReconnect(connection)}>
              <RefreshCw className="size-3.5" aria-hidden />Reconnect
            </Button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => onConfigure(connection)}>AI configuration →</button>
          <button type="button" className="text-xs font-medium text-muted-foreground hover:underline" onClick={() => onDisconnect(connection)}>Disconnect</button>
        </div>
      </div>
    </div>
  );
}
