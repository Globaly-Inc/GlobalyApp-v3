"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { useFieldSaver } from "./editable-field";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import { AddAgentForm, type AgentValues } from "./add-agent-form";
import { AgentCard } from "./agent-card";
import { AgentExtractionHistory } from "./agent-extraction-history";
import type { AgentFull, AgentRun, ExtractionJob } from "../apis/types";

const DEFAULT_PAGE_SIZE = 10;

export function AgentsTab({
  jobId,
  job,
  onReload,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
}>) {
  const [agents, setAgents] = useState<AgentFull[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  // Accepts overrides for the same reason study-units-tab.tsx does — setState is async, so a
  // caller that also resets page/search right before reloading needs the new values applied
  // to THIS fetch immediately, not next render's stale closure.
  const load = useCallback(async (overrides?: { page?: number; limit?: number; search?: string }) => {
    try {
      const res = await allExtractionsApi.getAgentsFiltered(jobId, {
        page: overrides?.page ?? page,
        limit: overrides?.limit ?? limit,
        search: (overrides?.search ?? search).trim() || undefined,
      });
      setAgents(res.data);
      setTotal(res.meta?.total ?? 0);
    } catch (e) {
      toast.error("Failed to load agents", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId, page, limit, search]);

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await allExtractionsApi.getAgentRuns(jobId));
    } catch (e) {
      toast.error("Failed to load extraction history", { description: (e as Error).message });
    } finally {
      setRunsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      load();
      return;
    }
    // Debounce so typing in the search box doesn't fire a request per keystroke.
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Independent of search/pagination — fetch once (and again if the job changes).
  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // A search change invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleRerun = async () => {
    setRerunning(true);
    try {
      await allExtractionsApi.runStep(jobId, "agents");
      toast.success("Agents extraction started", { description: "Running in the background — you can switch tabs." });
      onReload();
      await Promise.all([load(), loadRuns()]);
    } catch (e) {
      toast.error("Run failed", { description: (e as Error).message });
    } finally {
      setRerunning(false);
    }
  };

  const handleCreate = async (values: AgentValues) => {
    setSaving(true);
    try {
      await allExtractionsApi.createAgent({
        job_id: jobId,
        ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null])),
      });
      toast.success("Agent added");
      setAdding(false);
      await load();
    } catch (e) {
      toast.error("Failed to add agent", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ids: string[]) => {
    const many = ids.length > 1;
    if (!(await confirm(many ? `Delete ${ids.length} agents?` : "Delete agent?"))) {
      return;
    }
    try {
      await Promise.all(ids.map((id) => allExtractionsApi.deleteAgent(id)));
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      toast.success(many ? `${ids.length} agents deleted` : "Agent deleted");
      await load();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    }
  };

  const saveField = useFieldSaver(jobId, load);
  const { confirm, dialog } = useConfirmDelete();

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="agents"
        label="Agents"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.agents}
        lastUpdated={latestTimestamp(agents)}
        hasData={total > 0}
        onChanged={onReload}
      />

      <div className="space-y-3">
        <AgentExtractionHistory runs={runs} loading={runsLoading} rerunning={rerunning} onRerun={handleRerun} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={agents.length > 0 && selectedIds.length === agents.length}
                onCheckedChange={() =>
                  setSelectedIds(selectedIds.length === agents.length ? [] : agents.map((a) => a.id))
                }
                disabled={agents.length === 0}
              />
              {total} agent{total === 1 ? "" : "s"}
              {search.trim() && ` · ${agents.length} on this page`}
            </label>
            {selectedIds.length > 0 && (
              <Button
                variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
                onClick={() => handleDelete(selectedIds)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selectedIds.length}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, country, email, city…"
                className="h-9 w-64 pl-7 text-xs"
              />
            </div>
            <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Add Agent
            </Button>
          </div>
        </div>

        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
            <AddAgentForm saving={saving} onCancel={() => setAdding(false)} onSave={handleCreate} />
          </DialogContent>
        </Dialog>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && agents.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{search.trim() ? "No agents match your search" : "No agents yet"}</p>
              {!search.trim() && (
                <p className="mt-1 text-xs">Run the extraction to find agents.</p>
              )}
              {search.trim() && (
                <Button variant="ghost" size="sm" className="mt-2 gap-1.5 cursor-pointer" onClick={() => setSearch("")}>
                  <X className="h-3.5 w-3.5" />
                  Clear search
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={selectedIds.includes(agent.id)}
            onToggleSelect={() =>
              setSelectedIds((prev) => (prev.includes(agent.id) ? prev.filter((x) => x !== agent.id) : [...prev, agent.id]))
            }
            onDelete={() => handleDelete([agent.id])}
            onSaveField={(column, next) => saveField("extraction_agents", agent.id, column, next)}
          />
        ))}

        {total > 0 && (
          <Pagination
            page={page}
            total={total}
            limit={limit}
            onPageChange={setPage}
            align="end"
            onPageSizeChange={(next) => { setLimit(next); setPage(1); }}
          />
        )}
      </div>
    </div>
  );
}
