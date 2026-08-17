"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchAuditLogs } from "../store/logs-slice";
import type { AuditLogEntry, AuditLogSource, ListAuditLogsParams } from "../apis/types";

const PAGE_SIZE = 20;

type FilterState = {
  source: AuditLogSource | "all";
  action: string;
  entity_type: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: FilterState = { source: "all", action: "", entity_type: "", from: "", to: "" };

function toParams(filters: FilterState, page: number): ListAuditLogsParams {
  return {
    page,
    limit: PAGE_SIZE,
    source: filters.source === "all" ? undefined : filters.source,
    action: filters.action.trim() || undefined,
    entity_type: filters.entity_type.trim() || undefined,
    from: filters.from || undefined,
    // A bare date means "the whole of that day", so extend `to` to its last instant.
    to: filters.to ? `${filters.to}T23:59:59.999Z` : undefined,
  };
}

function actorLabel(log: AuditLogEntry): string {
  return log.actor_name ?? log.actor_email ?? "System";
}

export function LogsView() {
  const dispatch = useAppDispatch();
  const { logs, page, total, totalPages, status, error } = useAppSelector((state) => state.monitoringLogs);

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  // Only committed filters drive fetches — typing must not fire a request per keystroke.
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const [requestedPage, setRequestedPage] = useState(1);

  // Strict Mode double-invokes effects, so key the fetch on its params rather than
  // on mount — a repeat of the same query is skipped, a new one still runs.
  const lastQueryRef = useRef<string>("");
  useEffect(() => {
    const params = toParams(applied, requestedPage);
    const key = JSON.stringify(params);
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    dispatch(fetchAuditLogs(params));
  }, [dispatch, applied, requestedPage]);

  const applyFilters = () => {
    setRequestedPage(1);
    setApplied(filters);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setRequestedPage(1);
    setApplied(EMPTY_FILTERS);
  };

  const update = (patch: Partial<FilterState>) => setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">A timestamped feed of admin and platform actions.</p>
      </div>

      <Card className="mb-4">
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="lg:col-span-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-source">
              Source
            </label>
            <Select value={filters.source} onValueChange={(v) => update({ source: v as FilterState["source"] })}>
              <SelectTrigger id="audit-source" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="platform">Platform</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-action">
              Action
            </label>
            <Input
              id="audit-action"
              className="mt-1"
              placeholder="ADMIN_INVITE_SENT"
              value={filters.action}
              onChange={(e) => update({ action: e.target.value })}
            />
          </div>

          <div className="lg:col-span-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-entity">
              Entity type
            </label>
            <Input
              id="audit-entity"
              className="mt-1"
              placeholder="extraction_job"
              value={filters.entity_type}
              onChange={(e) => update({ entity_type: e.target.value })}
            />
          </div>

          <div className="lg:col-span-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-from">
              From
            </label>
            <Input
              id="audit-from"
              type="date"
              className="mt-1"
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </div>

          <div className="lg:col-span-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-to">
              To
            </label>
            <Input
              id="audit-to"
              type="date"
              className="mt-1"
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
            />
          </div>

          <div className="flex gap-2 lg:col-span-1">
            <Button onClick={applyFilters} className="cursor-pointer">
              Apply
            </Button>
            <Button variant="outline" onClick={resetFilters} className="cursor-pointer">
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {total} {total === 1 ? "entry" : "entries"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {status === "failed" && <p className="text-sm text-destructive">{error}</p>}
          {status === "loading" && logs.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
          {status === "idle" && logs.length === 0 && (
            <p className="text-sm text-muted-foreground">No audit entries match these filters.</p>
          )}

          {logs.map((log) => (
            <div key={log.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground truncate">{log.action}</p>
                  <Badge variant={log.source === "admin" ? "default" : "secondary"}>{log.source}</Badge>
                </div>
                <p className="text-muted-foreground truncate">{actorLabel(log)}</p>
                {log.entity_type && (
                  <p className="text-xs text-muted-foreground truncate">
                    {log.entity_type}
                    {log.entity_id ? ` · ${log.entity_id}` : ""}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || status === "loading"}
              onClick={() => setRequestedPage(page - 1)}
              className="cursor-pointer"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= totalPages || status === "loading"}
              onClick={() => setRequestedPage(page + 1)}
              className="cursor-pointer"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
