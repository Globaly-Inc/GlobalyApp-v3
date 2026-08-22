"use client";

import { Search, Upload, Loader2, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MAX_SELECTION } from "../const";
import type { AgentCISResult, ImportResult } from "../apis/types";

/** Search box, results table, selection summary, and import dispatch — the "find and
 * hand-pick institutions" half of the page. Bulk crawl (scan-everything) is a separate
 * card since it's a different mental model, not a variant of this one. */
export function AgentcisSearchCard({
  query,
  onQueryChange,
  searchLoading,
  results,
  selectedIds,
  onToggle,
  onClearSelection,
  onImport,
  importLoading,
  importResult,
  onClearImportResult,
  error,
}: Readonly<{
  query: string;
  onQueryChange: (q: string) => void;
  searchLoading: boolean;
  results: AgentCISResult[];
  selectedIds: string[];
  onToggle: (id: string | number) => void;
  onClearSelection: () => void;
  onImport: () => void;
  importLoading: boolean;
  importResult: ImportResult | null;
  onClearImportResult: () => void;
  error: string | null;
}>) {
  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search institutions by name..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="pl-9"
          />
          {searchLoading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedIds.length}/{MAX_SELECTION} selected
            </span>
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              Clear all
            </Button>
          </div>
        )}

        {results.length === 0 && !searchLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {query ? "No institutions found." : "Start typing to search AgentCIS..."}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="w-10 p-3" />
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Country</th>
                  <th className="text-left p-3 font-medium">City</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const sid = String(r.id);
                  return (
                    <tr
                      key={sid}
                      className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => onToggle(r.id)}
                    >
                      <td className="p-3 text-center">
                        <Checkbox checked={selectedIds.includes(sid)} onCheckedChange={() => onToggle(r.id)} />
                      </td>
                      <td className="p-3 font-medium text-foreground">{r.name}</td>
                      <td className="p-3 text-muted-foreground">{r.country ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{r.city ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={onImport} disabled={importLoading || selectedIds.length === 0} className="gap-2">
            {importLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importLoading ? "Importing..." : `Import Selected${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>

        {importResult && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Import dispatched — {importResult.job_count} job{importResult.job_count === 1 ? "" : "s"} queued.
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={onClearImportResult}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
