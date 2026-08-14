"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Upload, Loader2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { MAX_SELECTION } from "../const";
import {
  searchAgentCIS,
  importAgentCIS,
  toggleSelection,
  clearSelection,
  clearImportResult,
} from "../store/agentcis-import-slice";

export function AgentcisImportView() {
  const dispatch = useAppDispatch();
  const { searchResults, selectedIds, searchStatus, importStatus, importResult, error } =
    useAppSelector((state) => state.dataAgentcisImport);

  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFetchRef = useRef(false);

  // Fetch default results on mount
  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    dispatch(searchAgentCIS(""));
  }, [dispatch]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      dispatch(searchAgentCIS(query));
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, dispatch]);

  const handleImport = useCallback(() => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one institution first.");
      return;
    }
    dispatch(importAgentCIS(selectedIds));
  }, [dispatch, selectedIds]);

  const handleToggle = (id: number) => {
    if (!selectedIds.includes(id) && selectedIds.length >= MAX_SELECTION) {
      toast.error(`Maximum ${MAX_SELECTION} institutions per import.`);
      return;
    }
    dispatch(toggleSelection(id));
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AgentCIS Import</h1>
        <p className="text-muted-foreground mt-1">
          Search AgentCIS and import institutions into the extraction queue.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search institutions by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
            {searchStatus === "loading" && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Selection summary */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length}/{MAX_SELECTION} selected
              </span>
              <Button variant="ghost" size="sm" onClick={() => dispatch(clearSelection())}>
                Clear all
              </Button>
            </div>
          )}

          {/* Results table */}
          {searchResults.length === 0 && searchStatus !== "loading" ? (
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
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Country</th>
                    <th className="text-left p-3 font-medium">Region</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => handleToggle(r.id)}
                    >
                      <td className="p-3 text-center">
                        <Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => handleToggle(r.id)} />
                      </td>
                      <td className="p-3 font-medium text-foreground">{r.name}</td>
                      <td className="p-3 text-muted-foreground">{r.type}</td>
                      <td className="p-3 text-muted-foreground">{r.country}</td>
                      <td className="p-3 text-muted-foreground">{r.region}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Import button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleImport}
              disabled={importStatus === "loading" || selectedIds.length === 0}
              className="gap-2"
            >
              {importStatus === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {importStatus === "loading"
                ? "Importing..."
                : `Import Selected${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
            </Button>

            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>

          {/* Import result */}
          {importResult && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Import dispatched — {importResult.job_count} job{importResult.job_count === 1 ? "" : "s"} queued.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 w-6 p-0"
                onClick={() => dispatch(clearImportResult())}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
