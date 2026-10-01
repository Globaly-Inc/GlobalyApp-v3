"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
// ponytail: the extraction's own form and confirm dialog — an institution's scholarships ARE its
// extraction job's rows, so the business portal edits them exactly as the superadmin does.
import { COVERAGE_TYPE_OPTIONS, ScholarshipForm } from "@/app/admin/data/all-extractions/components/scholarship-form";
import { APPLICABLE_TO_OPTIONS } from "@/app/admin/data/all-extractions/const";
import { Combobox } from "@/components/combobox";
import { useConfirmDelete } from "@/app/admin/data/all-extractions/components/use-confirm-delete";
import { useAppSelector } from "@/lib/hooks";
import { businessProfileDetailApi } from "../../apis";
import { OriginChip, type Origin } from "../origin-chip";
import type { ExtractedScholarship, ExtractedScholarshipParams, ScholarshipListParams, SharedServices } from "../../apis/types";
import { ServiceSharingPicker } from "../services/service-sharing-picker";

/** The list also carries the head office's scholarships for this branch's shared courses, and
 * each row's linked courses (none = institution-wide). */
type Row = ExtractedScholarship & { shared?: boolean; courses?: { id: string; name: string }[]; origin?: Origin };
const isShared = (s: ExtractedScholarship) => (s as Row).shared === true;

function CoursesCell({ s }: Readonly<{ s: ExtractedScholarship }>) {
  const courses = (s as Row).courses ?? [];
  const [first] = courses;
  if (!first) return <span className="text-muted-foreground">All courses</span>;
  return (
    <span title={courses.map((c) => c.name).join("\n")}>
      {first.name}
      {courses.length > 1 && <span className="ml-1 text-xs text-muted-foreground">+{courses.length - 1} more</span>}
    </span>
  );
}

const PAGE_SIZE = 10;
const label = (v: string | null) => (v ? v.replaceAll("_", " ") : "—");

/** An institution's Scholarships tab: the rows on its extraction job (superadmin.extraction_scholarships),
 * the same way its Services tab lists the job's courses. Adding one here adds it to the job. */
// Server-side filters (every page). "all" in a picker = that filter left off.
type Filters = Pick<ScholarshipListParams, "applicable_to" | "coverage_type" | "origin">;
const ALL = "all";
const FILTERS: { key: keyof Filters; all: string; options: { value: string; label: string }[] }[] = [
  { key: "origin", all: "All sources", options: [{ value: "extracted", label: "Extracted" }, { value: "manual", label: "Manually added" }] },
  { key: "applicable_to", all: "All students", options: APPLICABLE_TO_OPTIONS },
  { key: "coverage_type", all: "All coverage", options: COVERAGE_TYPE_OPTIONS },
];

export function InstitutionScholarshipsTab() {
  // The org's Default Currency card value — preselected on a new scholarship.
  const orgCurrency = useAppSelector((st) => st.businessOnboarding.profile?.currency ?? null);
  const [rows, setRows] = useState<ExtractedScholarship[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ExtractedScholarship | "new" | null>(null);
  // The form's course links: "all" = linked to no course, i.e. it applies to every course.
  const [courseIds, setCourseIds] = useState<SharedServices>("all");
  const openEditor = (s: ExtractedScholarship | "new") => {
    const linked = s === "new" ? [] : ((s as Row).courses ?? []).map((c) => c.id);
    setCourseIds(linked.length > 0 ? linked : "all");
    setEditing(s);
  };
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDelete();

  const load = async (p: number) => {
    setLoading(true);
    try {
      const res = await businessProfileDetailApi.getExtractedScholarships({ search: search || undefined, ...filters, page: p, limit: PAGE_SIZE });
      setRows(res.data);
      setTotal(res.total);
    } catch (e) {
      toast.error("Couldn't load scholarships", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      load(1);
      return;
    }
    setPage(1);
    const timer = setTimeout(() => load(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters]);

  const save = async (values: ExtractedScholarshipParams) => {
    setSaving(true);
    try {
      const input = { ...values, course_ids: courseIds === "all" ? [] : courseIds };
      if (editing && editing !== "new") await businessProfileDetailApi.updateExtractedScholarship(editing.id, input);
      else await businessProfileDetailApi.createExtractedScholarship(input);
      toast.success(editing === "new" ? "Scholarship created" : "Scholarship updated");
      setEditing(null);
      await load(page);
    } catch (e) {
      toast.error("Couldn't save scholarship", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: ExtractedScholarship) => {
    if (!(await confirm("Remove this scholarship?", `"${s.name}" will be removed from your institution.`, { confirmLabel: "Remove" }))) return;
    try {
      await businessProfileDetailApi.deleteExtractedScholarship(s.id);
      toast.success("Scholarship removed");
      await load(rows.length === 1 && page > 1 ? page - 1 : page);
      if (rows.length === 1 && page > 1) setPage(page - 1);
    } catch (e) {
      toast.error("Couldn't remove scholarship", { description: (e as Error).message });
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Scholarships</h2>
          <p className="text-muted-foreground">Offer scholarships to attract prospective students.</p>
        </div>
        <Button className="h-10" onClick={() => openEditor("new")}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New scholarship
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-9" placeholder="Search your scholarships..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {FILTERS.map((f) => (
          <Combobox
            key={f.key}
            className="h-10 w-44"
            options={[{ value: ALL, label: f.all }, ...f.options]}
            value={filters[f.key] ?? ALL}
            onChange={(v) => setFilters((cur) => ({ ...cur, [f.key]: v === ALL ? undefined : v }))}
            placeholder={f.all}
          />
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <GraduationCap className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No scholarships yet</p>
          <p className="text-xs text-muted-foreground">Create a scholarship to list it for students.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Courses</th>
                <th className="p-3 text-left">Applies to</th>
                <th className="p-3 text-left">Coverage</th>
                <th className="p-3 text-left">Amount</th>
                <th className="p-3 text-left">Deadline</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="max-w-80 truncate p-3 font-medium" title={s.name}>
                    {s.name}
                    {(s as Row).origin && <span className="ml-2"><OriginChip origin={(s as Row).origin!} /></span>}
                    {isShared(s) && <Badge variant="secondary" className="ml-2 text-[10px]">From head office</Badge>}
                  </td>
                  <td className="max-w-64 truncate p-3"><CoursesCell s={s} /></td>
                  <td className="p-3 capitalize text-muted-foreground">{label(s.applicable_to)}</td>
                  <td className="p-3 capitalize">{label(s.coverage_type)}</td>
                  <td className="p-3 whitespace-nowrap">{s.amount != null ? `${s.currency ?? ""} ${s.amount.toLocaleString()}`.trim() : "—"}</td>
                  <td className="p-3 whitespace-nowrap">{s.deadline ? new Date(s.deadline).toLocaleDateString() : "—"}</td>
                  <td className="p-3">
                    {/* Shared rows belong to the head office — edited there, so every branch sees the change. */}
                    {!isShared(s) && <div className="flex items-center justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => openEditor(s)} aria-label="Edit scholarship">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => remove(s)} aria-label="Remove scholarship">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={(p) => { setPage(p); load(p); }} />}

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-2xl">
          <DialogTitle className="sr-only">{editing === "new" ? "New scholarship" : "Edit scholarship"}</DialogTitle>
          {editing !== null && (
            <ScholarshipForm
              key={editing === "new" ? "new" : editing.id}
              scholarship={editing === "new" ? undefined : editing}
              saving={saving}
              defaultCurrency={orgCurrency}
              onCancel={() => setEditing(null)}
              onSave={save}
              extraFields={
                <ServiceSharingPicker
                  value={courseIds}
                  onChange={setCourseIds}
                  label="Courses"
                  allLabel="All courses"
                  allNote="This scholarship applies to every course."
                  emptyText="No courses yet — it applies to every course you add."
                />
              }
            />
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
