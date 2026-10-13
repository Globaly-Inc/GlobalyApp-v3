"use client";

import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReferralCodePanelProps = {
  code: string;
  link: string;
  canShare: boolean;
  onCopy: () => void;
  onShareWhatsApp: () => void;
  onShareNative: () => void;
};

/** The code, its link and the share buttons — rendered inside the page's navy HeroCard. */
export function ReferralCodePanel({ code, link, canShare, onCopy, onShareWhatsApp, onShareNative }: Readonly<ReferralCodePanelProps>) {
  return (
    <div className="rounded-lg bg-white/10 p-4 ring-1 ring-inset ring-white/15 sm:p-5">
      <p className="text-sm font-medium text-white/80">Your referral code</p>
      <p className="mt-1 break-all font-heading text-3xl font-medium tracking-widest text-white sm:text-4xl">{code}</p>
      {/* Selectable, so a blocked clipboard is still recoverable by hand. */}
      <p className="mt-2 select-all break-all font-mono text-sm text-white/70">{link}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" className="cursor-pointer font-semibold" onClick={onCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy link
        </Button>
        <Button
          variant="secondary"
          className="cursor-pointer bg-success font-semibold text-success-foreground hover:bg-success/90"
          onClick={onShareWhatsApp}
        >
          Share on WhatsApp
        </Button>
        {canShare && (
          <Button variant="secondary" className="cursor-pointer font-semibold" onClick={onShareNative}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        )}
      </div>
    </div>
  );
}
