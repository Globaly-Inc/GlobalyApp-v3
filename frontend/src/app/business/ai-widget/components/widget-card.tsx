"use client";

import { useState } from "react";
import { Check, Copy, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { EmbedConfig } from "../apis/types";

function embedSnippet(embedKey: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `<iframe src="${origin}/embed/${embedKey}" style="width:100%;max-width:420px;height:640px;border:0;border-radius:12px" title="AI Counsellor"></iframe>`;
}

export function WidgetCard({
  config,
  onDeactivate,
}: Readonly<{ config: EmbedConfig; onDeactivate: (id: number) => void }>) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(embedSnippet(config.embed_key));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const usagePct = Math.min(100, Math.round((config.credits_used_this_month / config.monthly_credit_limit) * 100));

  return (
    <Card className={config.is_active ? "" : "opacity-60"}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {config.brand_color && (
            <span className="inline-block size-3 rounded-full" style={{ backgroundColor: config.brand_color }} />
          )}
          {config.display_name ?? "Untitled widget"}
          {!config.is_active && <Badge variant="secondary">Inactive</Badge>}
        </CardTitle>
        {config.is_active && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Deactivate?</span>
              <Button size="sm" variant="destructive" onClick={() => onDeactivate(config.id)}>Yes</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>No</Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} title="Deactivate">
              <Power className="size-4" />
            </Button>
          )
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Messages this month</span>
            <span>{config.credits_used_this_month} / {config.monthly_credit_limit}</span>
          </div>
          <Progress value={usagePct} />
        </div>

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
