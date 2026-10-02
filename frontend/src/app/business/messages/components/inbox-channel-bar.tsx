"use client";

import Link from "next/link";
import { RadioTower, Settings } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";
import { CHANNELS_HREF } from "../const";
import { WidgetSwitch } from "./widget-switch";

/** Above the Inbox, as in GlobalyOS's Support Inbox: the widget switch, channels, and widget settings. */
export function InboxChannelBar() {
  const widgetOff = useAppSelector((s) => s.aiWidget.configs.length === 1 && s.aiWidget.configs[0]?.is_active === false);
  return (
    <div className="shrink-0 border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <WidgetSwitch />
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
      {widgetOff && (
        <p className="border-t border-border bg-amber-500/10 px-4 py-1.5 text-xs text-amber-900">
          The chat widget is off. It&apos;s hidden on your website and visitors can&apos;t send messages. Past conversations stay here.
        </p>
      )}
    </div>
  );
}
