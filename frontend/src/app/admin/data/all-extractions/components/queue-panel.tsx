"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, EyeOff, ListChecks, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { QUEUE_STATS } from "../const";
import type { QueueItem } from "../apis/types";

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_META = { icon: Clock, color: "text-muted-foreground", tint: "bg-muted" };

function statusMeta(status: string) {
  return QUEUE_STATS.find((s) => s.status === status) ?? DEFAULT_META;
}

export function QueuePanel({ jobId }: Readonly<{ jobId: string }>) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
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

  const selectFilter = (value: string) => {
    setFilter(value);
    setPage(1);
  };

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
  const pageItems = visible.slice((page - 1) * limit, page * limit);

  const sidebarFilters = [
    { status: "all", label: "All", icon: ListChecks, color: "text-foreground", count: items.length },
    ...QUEUE_STATS.map((s) => ({ ...s, count: countOf(s.status) })),
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        {QUEUE_STATS.map((s) => {
          const count = countOf(s.status);
          const isProcessing = s.status === "processing" && count > 0;
          return (
            <Card
              key={s.status}
              className={cn(
                "cursor-pointer transition-shadow hover:shadow-sm",
                filter === s.status && "ring-2 ring-primary",
              )}
              onClick={() => selectFilter(filter === s.status ? "all" : s.status)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", s.tint, s.color)}>
                  <s.icon className={cn("h-4 w-4", isProcessing && "animate-spin")} />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-xl font-bold leading-none", count === 0 ? "text-muted-foreground/50" : s.color)}>{count}</p>
                  <p className="truncate text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extraction Queue</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <nav className="w-44 shrink-0 space-y-0.5 border-r border-border pr-3">
            {sidebarFilters.map((f) => (
              <button
                key={f.status}
                onClick={() => selectFilter(f.status)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors cursor-pointer",
                  filter === f.status ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-2 truncate">
                  <f.icon className="h-3.5 w-3.5 shrink-0" />
                  {f.label}
                </span>
                <span className="text-xs tabular-nums">{f.count}</span>
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No queue items{filter !== "all" ? ` with status "${filter}"` : ""}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-primary/5 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-9 px-3 py-2" />
                        <th className="px-3 py-2 text-left font-medium">URL</th>
                        <th className="px-3 py-2 text-left font-medium">Kind</th>
                        <th className="px-3 py-2 text-left font-medium">Details</th>
                        <th className="w-28 px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pageItems.map((item) => {
                        const meta = statusMeta(item.status);
                        return (
                          <tr key={item.id} className="transition-colors hover:bg-muted/60">
                            <td className="px-3 py-2.5">
                              <meta.icon className={cn("h-4 w-4", meta.color, item.status === "processing" && "animate-spin")} />
                            </td>
                            <td className="max-w-xs truncate px-3 py-2.5 text-primary">{item.url}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{item.kind}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {item.retry_count > 0 && `${item.retry_count} ${item.retry_count === 1 ? "retry" : "retries"}`}
                              {item.error && <span className="text-destructive"> · {item.error}</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Retry" disabled={busyId === item.id} onClick={() => runAction(item.id, "retry")}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Ignore" disabled={busyId === item.id} onClick={() => runAction(item.id, "ignore")}>
                                  <EyeOff className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive cursor-pointer" title="Delete" disabled={busyId === item.id} onClick={() => runAction(item.id, "delete")}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  total={visible.length}
                  limit={limit}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setLimit(size); setPage(1); }}
                  align="end"
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
