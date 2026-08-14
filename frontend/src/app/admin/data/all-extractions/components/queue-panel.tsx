"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  EyeOff,
  Loader2,
  PauseCircle,
  RotateCcw,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { QUEUE_FILTERS, QUEUE_STATS } from "../const";
import type { QueueItem } from "../apis/types";

function StatusIcon({ status }: Readonly<{ status: string }>) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "processing":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case "ignored":
      return <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />;
    case "paused":
      return <PauseCircle className="h-3.5 w-3.5 text-amber-500" />;
    case "stopped":
      return <Square className="h-3.5 w-3.5 text-destructive" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function QueuePanel({ jobId }: Readonly<{ jobId: string }>) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setItems(await allExtractionsApi.getQueue(jobId));
    } catch (e) {
      toast.error("Could not load the extraction queue", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

  const runAction = async (id: string, action: "retry" | "ignore" | "delete") => {
    setBusyId(id);
    try {
      if (action === "retry") await allExtractionsApi.retryQueueItem(id);
      else if (action === "ignore") await allExtractionsApi.ignoreQueueItem(id);
      else await allExtractionsApi.deleteQueueItem(id);
      toast.success({ retry: "Queued for retry", ignore: "Ignored", delete: "Deleted" }[action]);
      await load();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const countOf = (status: string) => items.filter((i) => i.status === status).length;
  const visible = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
        {QUEUE_STATS.map((s) => (
          <Card
            key={s.status}
            className={cn(
              "cursor-pointer transition-shadow hover:shadow-sm",
              filter === s.status && "ring-2 ring-primary",
            )}
            onClick={() => setFilter(filter === s.status ? "all" : s.status)}
          >
            <CardContent className="pt-4 pb-3 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{countOf(s.status)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Extraction Queue</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {QUEUE_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  variant={filter === f.value ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-xs cursor-pointer"
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No queue items{filter !== "all" ? ` with status "${filter}"` : ""}
            </p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
              {visible.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2">
                  <StatusIcon status={item.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.url}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.kind}
                      {item.retry_count > 0 && ` · ${item.retry_count} ${item.retry_count === 1 ? "retry" : "retries"}`}
                      {item.error && ` · ${item.error}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="cursor-pointer"
                      title="Retry"
                      disabled={busyId === item.id}
                      onClick={() => runAction(item.id, "retry")}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="cursor-pointer"
                      title="Ignore"
                      disabled={busyId === item.id}
                      onClick={() => runAction(item.id, "ignore")}
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive cursor-pointer"
                      title="Delete"
                      disabled={busyId === item.id}
                      onClick={() => runAction(item.id, "delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
