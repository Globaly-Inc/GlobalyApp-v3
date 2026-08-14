"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { BranchForm, type BranchValues } from "./branch-form";
import { EditableField, useFieldSaver } from "./editable-field";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CampusFull, ExtractionJob } from "../apis/types";

// Empty strings would overwrite extracted values with blanks — send nulls instead.
const toPatch = (v: BranchValues) =>
  Object.fromEntries(Object.entries(v).map(([k, value]) => [k, value.trim() || null]));

function BranchCard({
  branch,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onSaveField,
}: Readonly<{
  branch: CampusFull;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
}>) {
  const field = (label: string, column: keyof CampusFull, span: string, multiline = false) => (
    <EditableField
      label={label}
      value={branch[column] as string | null}
      onSave={(v) => onSaveField(column, v)}
      multiline={multiline}
      className={span}
    />
  );
  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
            <Badge variant="outline" className="text-xs">{branch.country || "No country"}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
              title="Edit branch"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer text-destructive hover:text-destructive"
              title="Delete branch"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-6">
          {field("Name", "name", "col-span-2 md:col-span-3")}
          {field("Email", "email", "col-span-2 md:col-span-3")}
          {field("Phone", "phone", "col-span-2 md:col-span-3")}
          {field("Country", "country", "col-span-2 md:col-span-3")}
          {field("City", "city", "col-span-2 md:col-span-2")}
          {field("State", "state", "col-span-2 md:col-span-2")}
          {field("Postcode", "postcode", "col-span-2 md:col-span-2")}
          {field("Address", "address", "col-span-2 md:col-span-6", true)}
          {field("Map link", "map_link", "col-span-2 md:col-span-6")}
        </div>
      </CardContent>
    </Card>
  );
}

export function BranchesTab({
  jobId,
  job,
  onReload,
  onJumpToContext,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
  onJumpToContext: () => void;
}>) {
  const [branches, setBranches] = useState<CampusFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setBranches(await allExtractionsApi.getCampuses(jobId));
    } catch (e) {
      toast.error("Failed to load branches", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

  const saveField = useFieldSaver(jobId, load);
  const { confirm, dialog } = useConfirmDelete();
  const allSelected = branches.length > 0 && selectedIds.length === branches.length;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleCreate = async (values: BranchValues) => {
    setSaving(true);
    try {
      await allExtractionsApi.createCampus({ job_id: jobId, ...toPatch(values) });
      toast.success("Branch added");
      setAdding(false);
      await load();
    } catch (e) {
      toast.error("Failed to add branch", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, values: BranchValues) => {
    setSaving(true);
    try {
      // source_url isn't patchable on the backend — creation-time only.
      const { source_url: _ignored, ...patch } = toPatch(values);
      await allExtractionsApi.updateCampus(id, patch);
      toast.success("Branch updated");
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error("Update failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ids: string[]) => {
    const many = ids.length > 1;
    if (!(await confirm(many ? `Delete ${ids.length} branches?` : "Delete branch?"))) return;
    try {
      await Promise.all(ids.map((id) => allExtractionsApi.deleteCampus(id)));
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      toast.success(ids.length === 1 ? "Branch deleted" : `${ids.length} branches deleted`);
      await load();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    }
  };

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="branches"
        label="Branches"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.branches}
        lastUpdated={latestTimestamp(branches)}
        hasData={branches.length > 0}
        guidedUrls={job.guided_urls}
        contextKey="branches_urls"
        contextLabel="branches URLs"
        onChanged={onReload}
        onAddContext={onJumpToContext}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelectedIds(allSelected ? [] : branches.map((b) => b.id))}
              disabled={branches.length === 0}
            />
            Select all ({branches.length})
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 cursor-pointer"
              onClick={() => handleDelete(selectedIds)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
        </div>
        {!adding && (
          <Button className="gap-1.5 cursor-pointer" onClick={() => { setAdding(true); setEditingId(null); }}>
            <Plus className="h-4 w-4" />
            Add Branch
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {adding && <BranchForm saving={saving} onCancel={() => setAdding(false)} onSave={handleCreate} />}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && branches.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">No branches yet</p>
              <p className="mt-1 text-xs">Add one manually, or run the branches extraction above.</p>
            </CardContent>
          </Card>
        )}

        {branches.map((branch) =>
          editingId === branch.id ? (
            <BranchForm
              key={branch.id}
              branch={branch}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) => handleUpdate(branch.id, values)}
            />
          ) : (
            <BranchCard
              key={branch.id}
              branch={branch}
              selected={selectedIds.includes(branch.id)}
              onToggleSelect={() => toggleSelect(branch.id)}
              onEdit={() => { setEditingId(branch.id); setAdding(false); }}
              onDelete={() => handleDelete([branch.id])}
              onSaveField={(column, next) => saveField("extraction_campuses", branch.id, column, next)}
            />
          ),
        )}
      </div>
    </div>
  );
}
