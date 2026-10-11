"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn, useFieldSaver } from "./editable-field";
import { latestTimestamp } from "../utils";
import { EligibilityForm } from "./eligibility-form";
import { RequirementCard, type LinkedCourse } from "./eligibility-tab-card";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type {
  CourseLinks, EligibilityParams, EligibilityRequirement, ExtractionJob,
} from "../apis/types";

const DEFAULT_PAGE_SIZE = 10;

export function EligibilityTab({
  jobId,
  job,
  onReload,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
}>) {
  const [links, setLinks] = useState<CourseLinks | null>(null);
  const [requirements, setRequirements] = useState<EligibilityRequirement[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  // Accepts overrides for the same reason study-units-tab.tsx does — setState is async, so a
  // caller that also resets page/search right before reloading needs the new values applied
  // to THIS fetch immediately, not next render's stale closure.
  const load = useCallback(async (overrides?: { page?: number; limit?: number; search?: string }) => {
    try {
      const [requirementsRes, courseLinks] = await Promise.all([
        allExtractionsApi.getEligibilityRequirements(jobId, {
          page: overrides?.page ?? page,
          limit: overrides?.limit ?? limit,
          search: (overrides?.search ?? search).trim() || undefined,
        }),
        allExtractionsApi.getCourseLinks(jobId),
      ]);
      setRequirements(requirementsRes.data);
      setTotal(requirementsRes.meta?.total ?? 0);
      setLinks(courseLinks);
    } catch (e) {
      toast.error("Failed to load eligibility requirements", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId, page, limit, search]);

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


  const allSelected = requirements.length > 0 && selectedIds.length === requirements.length;

  const { confirm, dialog } = useConfirmDelete();
  const saveField = useFieldSaver(jobId, load);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const coursesForRequirement = (id: string): LinkedCourse[] =>
    (links?.eligibility_assignments ?? [])
      .filter((a) => a.eligibility_requirement_id === id)
      .map((a) => ({ id: a.course_id, name: a.course_name }));

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="courses"
        label="Eligibility"
        runLabel="Run Eligibility Extraction"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.courses}
        lastUpdated={latestTimestamp(requirements)}
        hasData={total > 0}
        onChanged={onReload}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // A search change invalidates the current page. Done here rather than in an
              // effect on [search]: same result, and the repo lints against set-state-in-effect.
              setPage(1);
            }}
            placeholder="Search eligibility requirements…"
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelectedIds(allSelected ? [] : requirements.map((r) => r.id))}
              disabled={requirements.length === 0}
            />
            {total} requirement{total === 1 ? "" : "s"}
            {search.trim() && ` · ${requirements.length} on this page`}
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} requirements?`))) {
                  return;
                }
                await run(async () => {
                  await Promise.all(selectedIds.map((id) => allExtractionsApi.deleteEligibilityRequirement(id)));
                  setSelectedIds([]);
                }, `${selectedIds.length} requirements deleted`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
        </div>
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add Requirement
        </Button>
      </div>

      <div className="space-y-3">
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
            <EligibilityForm
              saving={saving}
              onCancel={() => setAdding(false)}
              onSave={(values: EligibilityParams) =>
                run(async () => {
                  await allExtractionsApi.createEligibilityRequirement({ job_id: jobId, ...values });
                  setAdding(false);
                }, "Requirement created")
              }
            />
          </DialogContent>
        </Dialog>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && requirements.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{search.trim() ? "No requirements match your search" : "No eligibility requirements yet"}</p>
              {!search.trim() && (
                <p className="mt-1 text-xs">Add one manually, or extract them from a course in the Courses tab.</p>
              )}
            </CardContent>
          </Card>
        )}

        {requirements.map((requirement) =>
          editingId === requirement.id ? (
            <EligibilityForm
              key={requirement.id}
              requirement={requirement}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) =>
                run(async () => {
                  await saveFormAndLearn("extraction_eligibility_requirements", requirement, values, jobId);
                  setEditingId(null);
                }, "Requirement updated")
              }
            />
          ) : (
            <RequirementCard
              key={requirement.id}
              jobId={jobId}
              requirement={requirement}
              linked={coursesForRequirement(requirement.id)}
              selected={selectedIds.includes(requirement.id)}
              busy={saving}
              onToggleSelect={() =>
                setSelectedIds((prev) =>
                  prev.includes(requirement.id) ? prev.filter((x) => x !== requirement.id) : [...prev, requirement.id],
                )
              }
              onEdit={() => { setEditingId(requirement.id); setAdding(false); }}
              onDelete={async () => {
                if (!(await confirm("Delete requirement?"))) {
                  return;
                }
                await run(() => allExtractionsApi.deleteEligibilityRequirement(requirement.id), "Requirement deleted");
              }}
              onSaveField={(column, next) => saveField("extraction_eligibility_requirements", requirement.id, column, next)}
              onLinkCourse={(courseId) =>
                run(() => allExtractionsApi.assignJunction("eligibility-requirements", { job_id: jobId, course_id: courseId, entity_id: requirement.id }), "Linked to course")
              }
              onUnlinkCourse={(courseId) =>
                run(() => allExtractionsApi.unassignJunction("eligibility-requirements", { job_id: jobId, course_id: courseId, entity_id: requirement.id }), "Unlinked")
              }
            />
          ),
        )}
      </div>

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
  );
}
