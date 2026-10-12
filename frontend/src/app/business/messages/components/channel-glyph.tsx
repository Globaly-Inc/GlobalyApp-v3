import { cn } from "@/lib/utils";
import type { InboxChannel } from "@/app/business/ai-widget/apis/types";
import { INBOX_CHANNELS } from "../const";

const SIZES = {
  xs: "size-4 rounded [&_svg]:size-2.5",
  sm: "size-5 rounded-md [&_svg]:size-3",
  md: "size-6 rounded-full [&_svg]:size-3.5",
  lg: "size-10 rounded-lg [&_svg]:size-5",
} as const;

/** A channel's tinted icon tile — the same tint as its Channels page card. */
export function ChannelGlyph({ channel, size = "sm", className }: Readonly<{ channel: InboxChannel; size?: keyof typeof SIZES; className?: string }>) {
  const meta = INBOX_CHANNELS[channel];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", SIZES[size], meta.tint, className)} title={meta.label}>
      <Icon aria-hidden />
    </span>
  );
}
