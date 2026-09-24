"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award, Calendar, Coins, FileText, Link2, Loader2, Pencil, Plus, Search, Tag, Trash2, Type, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { CourseLinkPicker } from "./course-link-picker";
import { EditableField, saveFormAndLearn, useFieldSaver } from "./editable-field";
import { latestTimestamp } from "../utils";
import { ScholarshipForm } from "./scholarship-form";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import { RowActors } from "./row-actors";
import type { CourseLinks, ExtractionJob, Scholarship, ScholarshipParams } from "../apis/types";

type LinkedCourse = { id: string; name: string | null };

const CHIP_LIMIT = 6;
const DEFAULT_PAGE_SIZE = 10;

type EditableFieldProps = Parameters<typeof EditableField>[0];

function Field({ icon: Icon, className, ...field }: Readonly<EditableFieldProps & { icon: LucideIcon }>) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <EditableField {...field} className="flex-1" />
    </div>
  );
}

function ScholarshipCard({
  jobId, scholarship, linked, selected, busy,
  onToggleSelect, onEdit, onDelete, onSaveField, onLinkCourse, onUnlinkCourse,
}: Readonly<{
  jobId: string;
  scholarship: Scholarship;
  linked: LinkedCourse[];
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
  onLinkCourse: (courseId: string) => void;
  onUnlinkCourse: (courseId: string) => void;
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);
  const numberField = (v: string | null) => (v === null || v === "" ? null : (Number(v) as unknown as string));

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Award className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-foreground">{scholarship.name || "Scholarship"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100" title="Edit" disabled={busy} onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive" title="Delete" disabled={busy} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Field icon={Type} label="Name" value={scholarship.name} onSave={(v) => onSaveField("name", v)} className="col-span-2" />
          <Field icon={Users} label="Applicable To" value={scholarship.applicable_to} onSave={(v) => onSaveField("applicable_to", v)} className="col-span-2" />
          <Field icon={Tag} label="Coverage" value={scholarship.coverage_type} onSave={(v) => onSaveField("coverage_type", v)} className="col-span-2 md:col-span-1" />
          <Field icon={Coins} label="Amount" value={scholarship.amount?.toString() ?? null} onSave={(v) => onSaveField("amount", numberField(v))} className="col-span-2 md:col-span-1" />
          <Field icon={Coins} label="Currency" value={scholarship.currency} onSave={(v) => onSaveField("currency", v)} className="col-span-2 md:col-span-1" />
          <Field icon={Calendar} label="Deadline" value={scholarship.deadline?.slice(0, 10) ?? null} onSave={(v) => onSaveField("deadline", v)} className="col-span-2 md:col-span-1" />
          <Field icon={Link2} label="Application URL" value={scholarship.application_url} onSave={(v) => onSaveField("application_url", v)} className="col-span-2 md:col-span-4" />
          <Field icon={FileText} label="Description" value={scholarship.description} multiline onSave={(v) => onSaveField("description", v)} className="col-span-2 md:col-span-4" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className="text-xs">Shared by {linked.length} course{linked.length === 1 ? "" : "s"}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          {visible.map((course) => (
            <Badge key={course.id} className="gap-1 bg-primary/10 text-xs text-primary">
              {course.name ?? "Unnamed course"}
              {editingLinks && (
                <button type="button" className="cursor-pointer" title="Unlink course" onClick={() => onUnlinkCourse(course.id)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {linked.length === 0 && <span className="text-xs text-muted-foreground">Not linked to any course</span>}
          {linked.length > CHIP_LIMIT && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs cursor-pointer" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `+${linked.length - CHIP_LIMIT} more`}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs cursor-pointer" onClick={() => setEditingLinks((v) => !v)}>
            <Pencil className="h-3 w-3" />
            {editingLinks ? "Done" : "Edit"}
          </Button>
        </div>

        {editingLinks && (
          <CourseLinkPicker jobId={jobId} excludeIds={linked.map((c) => c.id)} onSelect={onLinkCourse} className="h-8 text-xs" />
        )}
        <RowActors row={scholarship} className="border-t border-border pt-2" />
      </CardContent>
    </Card>
  );
}

export function ScholarshipsTab({ jobId, job, onReload }: Readonly<{ jobId: string; job: ExtractionJob; onReload: () => void }>) {
  const [links, setLinks] = useState<CourseLinks | null>(null);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
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

  const load = useCallback(async () => {
    try {
      const [res, courseLinks] = await Promise.all([
        allExtractionsApi.getScholarships(jobId, { page, limit, search: search.trim() || undefined }),
        allExtractionsApi.getCourseLinks(jobId),
      ]);
      setScholarships(res.data);
      setTotal(res.meta?.total ?? 0);
      setLinks(courseLinks);
    } catch (e) {
      toast.error("Failed to load scholarships", { description: (e as Error).message });
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
    const t = setTimeout(load, 300); // debounce the search box
    return () => clearTimeout(t);
  }, [load]);

  const allSelected = scholarships.length > 0 && selectedIds.length === scholarships.length;
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

  const coursesFor = (id: string): LinkedCourse[] =>
    (links?.scholarship_assignments ?? [])
      .filter((a) => a.scholarship_id === id)
      .map((a) => ({ id: a.course_id, name: a.course_name }));

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="courses"
        label="Scholarships"
        runLabel="Run Scholarship Extraction"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.courses}
        lastUpdated={latestTimestamp(scholarships)}
        hasData={total > 0}
        onChanged={onReload}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search scholarships…"
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelectedIds(allSelected ? [] : scholarships.map((r) => r.id))}
              disabled={scholarships.length === 0}
            />
            {total} scholarship{total === 1 ? "" : "s"}
            {search.trim() && ` · ${scholarships.length} on this page`}
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer" disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} scholarships?`))) return;
                await run(async () => {
                  await Promise.all(selectedIds.map((id) => allExtractionsApi.deleteScholarship(id)));
                  setSelectedIds([]);
                }, `${selectedIds.length} scholarships deleted`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
        </div>
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add Scholarship
        </Button>
      </div>

      <div className="space-y-3">
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
            <ScholarshipForm
              saving={saving}
              onCancel={() => setAdding(false)}
              onSave={(values: ScholarshipParams) =>
                run(async () => {
                  await allExtractionsApi.createScholarship({ job_id: jobId, ...values });
                  setAdding(false);
                }, "Scholarship created")
              }
            />
          </DialogContent>
        </Dialog>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && scholarships.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Award className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{search.trim() ? "No scholarships match your search" : "No scholarships yet"}</p>
              {!search.trim() && <p className="mt-1 text-xs">Add one manually and link it to the courses it applies to.</p>}
            </CardContent>
          </Card>
        )}

        {scholarships.map((scholarship) =>
          editingId === scholarship.id ? (
            <ScholarshipForm
              key={scholarship.id}
              scholarship={scholarship}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) =>
                run(async () => {
                  await saveFormAndLearn("extraction_scholarships", scholarship, values, jobId);
                  setEditingId(null);
                }, "Scholarship updated")
              }
            />
          ) : (
            <ScholarshipCard
              key={scholarship.id}
              jobId={jobId}
              scholarship={scholarship}
              linked={coursesFor(scholarship.id)}
              selected={selectedIds.includes(scholarship.id)}
              busy={saving}
              onToggleSelect={() =>
                setSelectedIds((prev) => (prev.includes(scholarship.id) ? prev.filter((x) => x !== scholarship.id) : [...prev, scholarship.id]))
              }
              onEdit={() => { setEditingId(scholarship.id); setAdding(false); }}
              onDelete={async () => {
                if (!(await confirm("Delete scholarship?"))) return;
                await run(() => allExtractionsApi.deleteScholarship(scholarship.id), "Scholarship deleted");
              }}
              onSaveField={(column, next) => saveField("extraction_scholarships", scholarship.id, column, next)}
              onLinkCourse={(courseId) =>
                run(() => allExtractionsApi.assignJunction("scholarships", { job_id: jobId, course_id: courseId, entity_id: scholarship.id }), "Linked to course")
              }
              onUnlinkCourse={(courseId) =>
                run(() => allExtractionsApi.unassignJunction("scholarships", { job_id: jobId, course_id: courseId, entity_id: scholarship.id }), "Unlinked")
              }
            />
          ),
        )}
      </div>

      {total > 0 && (
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} align="end" onPageSizeChange={(next) => { setLimit(next); setPage(1); }} />
      )}
    </div>
  );
}
