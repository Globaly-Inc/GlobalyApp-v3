"use client";

import { useEffect, useState } from "react";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { deactivateEmbedConfig, fetchEmbedConfigs, reactivateEmbedConfig } from "@/app/business/ai-widget/store/ai-widget-slice";

/**
 * The widget's on/off switch, the switch the Channels page carries too. It drives the same
 * pause/resume endpoints as the widget's own settings card. With several widgets there's no
 * single thing to switch, so it links to where each one is managed instead.
 *
 * Off means off: the backend refuses every visitor request to a paused widget, including chats
 * a team member has taken over — which is why switching off says so, with an undo.
 */
export function WidgetSwitch({ showLabel = true }: Readonly<{ showLabel?: boolean }>) {
  const dispatch = useAppDispatch();
  const { configs, status, loaded } = useAppSelector((s) => s.aiWidget);
  const [busy, setBusy] = useState(false);

  // Keyed on `loaded`, not a mount ref: switching org resets the slice under a mounted Inbox,
  // and the new org's configs must be fetched. The thunk's `condition` absorbs Strict Mode's
  // double run; a failed fetch is not retried in a loop.
  useEffect(() => {
    if (loaded || status === "failed") return;
    dispatch(fetchEmbedConfigs());
  }, [dispatch, loaded, status]);

  if (status === "loading" && configs.length === 0) {
    return <span className="text-xs text-muted-foreground">Widget…</span>;
  }
  const [config] = configs;
  if (!config || configs.length !== 1) {
    const active = configs.filter((c) => c.is_active).length;
    return (
      <Link href={WIDGET_SETTINGS_HREF} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
        <MessageSquare className="size-3.5" aria-hidden />
        {configs.length === 0 ? "Set up the chat widget" : `Widgets · ${active} of ${configs.length} on`}
      </Link>
    );
  }

  const setOn = async (on: boolean) => {
    setBusy(true);
    const result = await dispatch(on ? reactivateEmbedConfig(config.id) : deactivateEmbedConfig(config.id));
    setBusy(false);
    if ("error" in result) {
      toast.error(on ? "Couldn't turn the widget on" : "Couldn't turn the widget off", { description: result.error.message ?? "Please try again." });
    } else if (!on) {
      toast("Chat widget turned off", {
        description: "It's hidden on your website, and visitors can't send messages until you turn it back on.",
        action: { label: "Undo", onClick: () => void setOn(true) },
      });
    }
  };

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1 text-sm">
      <MessageSquare className="size-3.5 text-primary" aria-hidden />
      {showLabel && <span>Widget · {config.is_active ? "On" : "Off"}</span>}
      <Switch checked={config.is_active} disabled={busy} onCheckedChange={(on) => void setOn(on)} aria-label="AI chat widget" />
    </label>
  );
}
