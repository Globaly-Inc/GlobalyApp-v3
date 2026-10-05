"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Palette } from "lucide-react";
import { WidgetSwitch } from "@/app/business/messages/components/widget-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmbedConfig } from "../apis/types";

// One script tag, not a raw iframe: public/embed.js renders the floating orb and only
// loads the chat panel once a visitor opens it, so the host page doesn't have to find room
// for a 420x640 block — or pay for a session nobody asked for.
export function embedSnippet(embedKey: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `<script src="${origin}/embed.js" data-key="${embedKey}" async></script>`;
}

/** Yes/No inline confirm, used for the two actions that break a live embed. */
function Confirm({ label, onYes, onNo }: Readonly<{ label: string; onYes: () => void; onNo: () => void }>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Button size="sm" variant="destructive" onClick={onYes}>Yes</Button>
      <Button size="sm" variant="outline" onClick={onNo}>No</Button>
    </div>
  );
}

export function WidgetCard({
  config,
  onEdit,
  onRotateKey,
}: Readonly<{
  config: EmbedConfig;
  /** Absent when the editor is on the same page. */
  onEdit?: (config: EmbedConfig) => void;
  onRotateKey: (id: number) => void;
}>) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<"rotate" | null>(null);

  const copy = async () => {
    await navigator.clipboard.writeText(embedSnippet(config.embed_key));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={config.is_active ? "" : "opacity-60"}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {config.brand_color && (
            <span className="inline-block size-3 rounded-full" style={{ backgroundColor: config.brand_color }} />
          )}
          {config.display_name ?? "Untitled widget"}
          {!config.is_active && <Badge variant="secondary">Paused</Badge>}
        </CardTitle>
        {confirming === "rotate" ? (
          <Confirm label="Old snippet stops working. Continue?" onYes={() => { onRotateKey(config.id); setConfirming(null); }} onNo={() => setConfirming(null)} />
        ) : (
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(config)} title="Appearance">
                <Palette className="size-4" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setConfirming("rotate")} title="Regenerate key">
              <KeyRound className="size-4" />
            </Button>
            {/* The same switch as above the Inbox: off asks nothing, and offers Undo instead. */}
            <WidgetSwitch />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(config.subtitle || config.greeting) && (
          <p className="text-xs text-muted-foreground">
            {config.subtitle}{config.subtitle && config.greeting ? " · " : ""}{config.greeting && `“${config.greeting}”`}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Embed on your website</p>
          <div className="flex items-start gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">{embedSnippet(config.embed_key)}</code>
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
