"use client";

import { useState } from "react";
import { Brain, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aiKnowledgeApi } from "../apis";
import type { EmbeddingStatus } from "../apis/types";

/**
 * The pending embedding backlog, on screen rather than in a log. A corpus that has
 * been crawled but not embedded is only reachable by the full-text half of hybrid
 * retrieval, and that is a fact an admin has to be able to see — not something the
 * counsellor quietly works around.
 */
export function EmbeddingStatusBanner({
  status, onRefresh,
}: Readonly<{ status: EmbeddingStatus | null; onRefresh: () => void }>) {
  const [busy, setBusy] = useState(false);

  if (!status) return null;

  const pending = status.chunks_awaiting > 0;
  const percent = status.chunks_total
    ? Math.round((status.chunks_embedded / status.chunks_total) * 100)
    : 0;

  const reembed = async () => {
    setBusy(true);
    try {
      const result = await aiKnowledgeApi.reembed();
      toast.success("Embedding queued", {
        description: `${result.documents_awaiting} document(s) waiting on ${result.model}.`,
      });
      onRefresh();
    } catch (e) {
      // A 503 here is the honest answer, not a failure to report.
      toast.error("Embedding unavailable", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs",
        pending ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border bg-card text-muted-foreground",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {pending ? (
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium">
            {status.chunks_embedded.toLocaleString()} of {status.chunks_total.toLocaleString()} chunks embedded ({percent}%)
            {" · "}
            {status.documents_awaiting.toLocaleString()} document{status.documents_awaiting === 1 ? "" : "s"} awaiting
          </p>
          <p className="mt-0.5">
            Model: {status.model}
            {status.provider_configured
              ? " · provider configured"
              : " · no embedding provider configured, so only full-text retrieval is live"}
          </p>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 cursor-pointer gap-1.5 text-xs"
        disabled={busy || !pending}
        onClick={reembed}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Embed pending
      </Button>
    </div>
  );
}
