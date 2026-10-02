"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  approveMemory, createMemory, deleteMemory, deprecateMemory, fetchMemories, fetchMemorySummary,
  reactivateMemory, unflagMemory, updateMemory,
} from "../store/ai-knowledge-slice";
import { MEMORY_FILTERS } from "../const";
import { filterToParams } from "../utils";
import type { CreateMemoryInput, Memory, PatchMemoryInput } from "../apis/types";
import type { MemoryFilter } from "../types";
import { MemoryCard } from "./memory-card";
import { MemoryDetailSheet } from "./memory-detail-sheet";
import { MemoryFormDialog } from "./memory-form-dialog";

const EMPTY_COPY: Record<string, string> = {
  candidate: "Nothing is waiting on you. New suggestions appear here after visitors have finished conversations.",
  conflicting: "Nothing your counsellor has learned contradicts your rules.",
  flagged: "No one has pushed back on a reply recently.",
  deprecated: "You haven't retired anything yet.",
};

export function MemoriesTab() {
  const dispatch = useAppDispatch();
  const { items, status, actionStatus, error } = useAppSelector((s) => s.aiKnowledge);

  const [filter, setFilter] = useState<MemoryFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Memory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | undefined>(undefined);

  // One effect for both inputs, debounced on search. The timer's cleanup is also what makes this
  // safe under Strict Mode's double-invoke — the first run's timer is cancelled before it fires,
  // so a mount sends one request, not two.
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(fetchMemories({ ...filterToParams(filter), q: search.trim() || undefined }));
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [dispatch, filter, search]);

  /**
   * Re-read the list AND the header's figures.
   *
   * The summary is a separate unfiltered read, so approving a candidate here would otherwise
   * leave "Waiting on you" showing the count from page load — a number contradicting the list
   * directly beneath it. Every path that changes a row goes through here for that reason.
   */
  const refetch = () => {
    dispatch(fetchMemories({ ...filterToParams(filter), q: search.trim() || undefined }));
    dispatch(fetchMemorySummary());
  };

  /**
   * Run a mutation, then re-read the list.
   *
   * Approving a candidate moves it out of the "Awaiting review" filter, so the row the reducer
   * swapped in place no longer belongs to the list it is sitting in. Re-reading is one request
   * and keeps the filter honest.
   */
  const run = async (mutate: () => Promise<unknown>) => {
    await mutate();
    setSelected(null);
    refetch();
  };

  const handleCreate = async (input: CreateMemoryInput): Promise<boolean> => {
    const result = await dispatch(createMemory(input));
    if (!createMemory.fulfilled.match(result)) return false;
    refetch();
    return true;
  };

  const handleUpdate = async (id: string, input: PatchMemoryInput): Promise<boolean> => {
    const result = await dispatch(updateMemory({ id, input }));
    if (!updateMemory.fulfilled.match(result)) return false;
    setSelected(null);
    refetch();
    return true;
  };

  const openEdit = (memory: Memory) => { setEditing(memory); setFormOpen(true); };
  const openCreate = () => { setEditing(undefined); setFormOpen(true); };

  // The other half of a contradiction, when this filter happens to hold it.
  const conflictsWith = useMemo(
    () => (selected?.conflicts_with_id ? items.find((m) => m.id === selected.conflicts_with_id) ?? null : null),
    [selected, items],
  );

  const busy = actionStatus === "loading";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-8"
            placeholder="Search what your counsellor knows"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add a rule
        </Button>
      </div>

      <AdminSegmentedTabs options={MEMORY_FILTERS} value={filter} onChange={setFilter} />

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {status === "loading" && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {error ?? "Couldn't load what your counsellor knows."}
        </div>
      )}

      {status === "idle" && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Brain className="size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {search ? "Nothing matches that search" : EMPTY_COPY[filter] ?? "Your counsellor has no rules yet"}
          </p>
          {!search && filter === "all" && (
            <p className="max-w-sm text-xs text-muted-foreground">
              Add the things you would tell a new counsellor on their first day. Your widget
              starts following them on the next message.
            </p>
          )}
        </div>
      )}

      {status === "idle" && items.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {items.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              busy={busy}
              onOpen={setSelected}
              onApprove={(m) => run(() => dispatch(approveMemory(m.id)))}
              onDeprecate={(m) => run(() => dispatch(deprecateMemory({ id: m.id, reason: "retired by the institution" })))}
              onReactivate={(m) => run(() => dispatch(reactivateMemory(m.id)))}
            />
          ))}
        </div>
      )}

      <MemoryDetailSheet
        memory={selected}
        conflictsWith={conflictsWith}
        open={!!selected}
        onOpenChange={(next) => !next && setSelected(null)}
        busy={busy}
        onApprove={(m) => run(() => dispatch(approveMemory(m.id)))}
        onDeprecate={(m) => run(() => dispatch(deprecateMemory({ id: m.id, reason: "retired by the institution" })))}
        onReactivate={(m) => run(() => dispatch(reactivateMemory(m.id)))}
        onUnflag={(m) => run(() => dispatch(unflagMemory(m.id)))}
        onDelete={(m) => run(() => dispatch(deleteMemory(m.id)))}
        onEdit={(m) => { setSelected(null); openEdit(m); }}
      />

      <MemoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        initial={editing}
        saving={busy}
      />
    </div>
  );
}
