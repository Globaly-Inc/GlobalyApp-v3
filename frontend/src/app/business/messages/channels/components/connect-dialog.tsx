"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChannelGlyph } from "../../components/channel-glyph";
import { CHANNELS_HREF, INBOX_CHANNELS } from "../../const";
import { channelsApi } from "../apis";
import type { ChannelConnection, ChannelKey } from "../apis/types";
import { CHANNEL_CARDS } from "../const";

/**
 * What the connect flow shows inside GlobalyApp. Zernio hosts the Meta login and the Page / number
 * picker in between, so there are only three moments here:
 *   intro     what AI will do, what you need → Continue sends the browser to Meta (via Zernio)
 *   success   back from Zernio and confirmed by our server → Configure AI
 *   error     Meta or Zernio said no → the reason, and Try again
 */
export type ConnectStep =
  | { kind: "intro"; channel: ChannelKey; reconnect?: ChannelConnection }
  | { kind: "success"; channel: ChannelKey; connection: ChannelConnection }
  | { kind: "error"; channel: ChannelKey; message: string };

export function ConnectDialog({
  step, onClose, onConfigure, onRetry,
}: Readonly<{
  step: ConnectStep | null;
  onClose: () => void;
  onConfigure: (c: ChannelConnection) => void;
  onRetry: (channel: ChannelKey) => void;
}>) {
  const [redirecting, setRedirecting] = useState(false);
  const label = step ? INBOX_CHANNELS[step.channel].label : "";
  const card = step ? CHANNEL_CARDS.find((c) => c.key === step.channel) : undefined;

  const continueToMeta = async () => {
    if (step?.kind !== "intro") return;
    setRedirecting(true);
    try {
      const url = await channelsApi.connectChannel(step.channel, { return_path: CHANNELS_HREF, reconnect_id: step.reconnect?.id });
      window.location.assign(url);
    } catch (err) {
      setRedirecting(false);
      toast.error(`Couldn't start connecting ${label}`, { description: err instanceof Error ? err.message : "Please try again." });
    }
  };

  return (
    <Dialog open={!!step} onOpenChange={(open) => { if (!open && !redirecting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {step?.kind === "intro" && (
          <>
            <DialogHeader>
              <div className="mb-1"><ChannelGlyph channel={step.channel} size="lg" /></div>
              <DialogTitle>{step.reconnect ? `Reconnect ${label}` : `Connect ${label}`}</DialogTitle>
              <DialogDescription>
                {step.reconnect
                  ? `Log in to Meta again to restore ${step.reconnect.handle ?? step.reconnect.display_name}. Settings and conversations are kept.`
                  : `Connect your ${card?.noun} to let AI automatically respond to customer conversations.`}
              </DialogDescription>
            </DialogHeader>
            {!step.reconnect && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {[`AI answers new ${label} messages within seconds, day and night`, "Conversations that need a person move to Needs Attention", "Take over any conversation and hand it back to AI"].map((t) => (
                  <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />{t}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              You&apos;ll need: {card?.need} You&apos;ll log in on Meta&apos;s own page, through our messaging partner Zernio, then come back here.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={redirecting}>Cancel</Button>
              <Button onClick={continueToMeta} disabled={redirecting}>
                {redirecting && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                Continue
              </Button>
            </DialogFooter>
          </>
        )}
        {step?.kind === "success" && (
          <>
            <DialogHeader>
              <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="size-6" aria-hidden /></div>
              <DialogTitle>{label} connected successfully</DialogTitle>
              <DialogDescription>AI can now automatically respond to incoming {label} conversations.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <ChannelGlyph channel={step.channel} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-medium">{step.connection.display_name}</p>
                <p className="truncate text-sm text-muted-foreground">{step.connection.handle}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Done</Button>
              <Button onClick={() => onConfigure(step.connection)}>Configure AI</Button>
            </DialogFooter>
          </>
        )}
        {step?.kind === "error" && (
          <>
            <DialogHeader>
              <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><TriangleAlert className="size-6" aria-hidden /></div>
              <DialogTitle>We couldn&apos;t connect {label}</DialogTitle>
              <DialogDescription>{step.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => onRetry(step.channel)}>Try again</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
