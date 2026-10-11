"use client";

import { Search, Upload, Loader2, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><span className="sr-only">Select</span></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Country</TableHead>
                  <TableHead className="hidden md:table-cell">City</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => {
                  const sid = String(r.id);
                  return (
                    <TableRow key={sid} className="cursor-pointer" onClick={() => onToggle(r.id)}>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.includes(sid)} onCheckedChange={() => onToggle(r.id)} />
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{r.country ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{r.city ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
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
