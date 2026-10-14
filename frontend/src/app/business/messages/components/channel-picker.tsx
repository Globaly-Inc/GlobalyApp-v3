"use client";

import { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { InboxChannel } from "@/app/business/ai-widget/apis/types";
import { INBOX_CHANNELS, INBOX_CHANNEL_ORDER } from "../const";
import { ChannelGlyph } from "./channel-glyph";

export type ChannelFilter = InboxChannel | "all";
export type ChannelHealth = "connected" | "error" | "off";

/** The connection dot beside a channel, wherever channels are listed. */
export const HEALTH_DOT: Record<ChannelHealth, { className: string; title: string }> = {
  connected: { className: "bg-success", title: "Connected" },
  error: { className: "bg-destructive", title: "Connection lost" },
  off: { className: "bg-muted-foreground/30", title: "Not connected" },
};

const label = (v: ChannelFilter) => (v === "all" ? "All channels" : INBOX_CHANNELS[v].label);

function Avatar({ value }: Readonly<{ value: ChannelFilter }>) {
  if (value !== "all") return <ChannelGlyph channel={value} size="md" />;
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Layers className="size-3.5" aria-hidden />
    </span>
  );
}

/**
 * "All channels ▾" — one row per channel with its connection dot and a count. Used by the Inbox
 * list and by Visitors & Leads, so a channel is filtered the same way in both.
 */
export function ChannelPicker({
  value, onChange, count, health,
}: Readonly<{
  value: ChannelFilter;
  onChange: (value: ChannelFilter) => void;
  /** Omit where counts per channel aren't known (a server-filtered list). */
  count?: (value: ChannelFilter) => number;
  /** Connection state per channel; omit to hide the dots. */
  health?: Partial<Record<InboxChannel, ChannelHealth>>;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card pl-1.5 pr-2.5 text-left text-sm font-medium hover:bg-muted"
          />
        }
      >
        <Avatar value={value} />
        <span className="min-w-0 flex-1 truncate">{label(value)}</span>
        {count && <span className="text-xs tabular-nums text-muted-foreground">{count(value)}</span>}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      {open && (
        <PopoverContent align="start" className="w-(--anchor-width) gap-0 p-1.5">
          <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channels</p>
          {(["all", ...INBOX_CHANNEL_ORDER] as ChannelFilter[]).map((v) => {
            const dot = v !== "all" && health ? HEALTH_DOT[health[v] ?? "off"] : null;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={value === v}
                onClick={() => { onChange(v); setOpen(false); }}
                className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", value === v && "bg-muted font-semibold")}
              >
                <Avatar value={v} />
                <span className="min-w-0 flex-1 truncate">{label(v)}</span>
                {dot && <span className={cn("size-1.5 rounded-full", dot.className)} title={dot.title} />}
                {count && <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{count(v)}</span>}
              </button>
            );
          })}
        </PopoverContent>
      )}
    </Popover>
  );
}
