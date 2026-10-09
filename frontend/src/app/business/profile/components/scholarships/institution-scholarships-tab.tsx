"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
// ponytail: the extraction's own form and confirm dialog — an institution's scholarships ARE its
// extraction job's rows, so the business portal edits them exactly as the superadmin does.
import { COVERAGE_TYPE_OPTIONS, ScholarshipForm } from "@/app/admin/data/all-extractions/components/scholarship-form";
import { APPLICABLE_TO_OPTIONS } from "@/app/admin/data/all-extractions/const";
import { Combobox } from "@/components/combobox";
import { useConfirmDelete } from "@/app/admin/data/all-extractions/components/use-confirm-delete";
import { useAppSelector } from "@/lib/hooks";
import { businessProfileDetailApi } from "../../apis";
import type { ExtractedScholarship, ExtractedScholarshipParams, ScholarshipListParams, SharedServices } from "../../apis/types";
import { ServiceSharingPicker } from "../services/service-sharing-picker";
import { cn } from "@/lib/utils";
import { InstitutionScholarshipsTable, type Row } from "./institution-scholarships-table";
import { PortalPageHeader } from "../portal-ui/portal-page-header";
import { PortalAddButton } from "../portal-ui/portal-add-button";
import { PortalStats } from "../portal-ui/portal-stats";
import { PortalStatTile } from "../portal-ui/portal-stat-tile";
import { FILTER, FILTER_ACTIVE } from "../portal-ui/portal-ui";
import { ScholarshipSearch } from "./scholarship-search";
import { ScholarshipsEmptyState } from "./scholarships-empty-state";

const PAGE_SIZE = 10;

/** An institution's Scholarships tab: the rows on its extraction job (superadmin.extraction_scholarships),
 * the same way its Services tab lists the job's courses. Adding one here adds it to the job. */
// Server-side filters (every page). "all" in a picker = that filter left off.
type Filters = Pick<ScholarshipListParams, "applicable_to" | "coverage_type" | "origin">;
const ALL = "all";
const FILTERS: { key: keyof Filters; all: string; options: { value: string; label: string }[] }[] = [
  { key: "origin", all: "All sources", options: [{ value: "extracted", label: "Extracted" }, { value: "manual", label: "Manually added" }] },
  // "Both" rows are the ones open to all students; the mockup lists only the two specific groups.
  { key: "applicable_to", all: "All students", options: APPLICABLE_TO_OPTIONS.filter((o) => o.value !== "both") },
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

  // Summary strip: from the rows on this page only (the API returns no cross-page breakdown).
  const onPage = total > rows.length ? " (this page)" : "";
  const filtering = search !== "" || Object.values(filters).some(Boolean);
  const clearFilters = () => { setSearch(""); setFilters({}); };
  const stats = [
    { label: "Full tuition", value: rows.filter((s) => s.coverage_type === "full_tuition").length },
    { label: "Stipends", value: rows.filter((s) => s.coverage_type === "stipend" || s.coverage_type === "living_allowance").length },
    { label: "Courses linked", value: new Set(rows.flatMap((s) => ((s as Row).courses ?? []).map((c) => c.id))).size },
  ];
  const missing = rows.filter((s) => s.amount == null || !s.deadline).length;

  return (
    <div className="flex flex-col gap-4">
      <PortalPageHeader title="Scholarships" count={total} subtitle="Offer scholarships to attract prospective students.">
        <PortalAddButton onClick={() => openEditor("new")}>New scholarship</PortalAddButton>
      </PortalPageHeader>

      <PortalStats>
        {stats.map((st) => <PortalStatTile key={st.label} label={st.label + onPage} value={st.value} />)}
        <PortalStatTile label={`Missing amount or deadline${onPage}`} value={missing} warn />
      </PortalStats>

      <div className="flex flex-wrap items-center gap-2">
        <ScholarshipSearch value={search} onChange={setSearch} />
        {FILTERS.map((f) => (
          <Combobox
            key={f.key}
            className={cn(FILTER, "w-40 shrink-0", filters[f.key] && FILTER_ACTIVE)}
            options={[{ value: ALL, label: f.all }, ...f.options]}
            value={filters[f.key] ?? ALL}
            onChange={(v) => setFilters((cur) => ({ ...cur, [f.key]: v === ALL ? undefined : v }))}
            placeholder={f.all}
          />
        ))}
      </div>

      <div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <ScholarshipsEmptyState onClear={filtering ? clearFilters : undefined} />
        ) : (
          <InstitutionScholarshipsTable rows={rows} onEdit={openEditor} onRemove={remove} />
        )}
        {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={(p) => { setPage(p); load(p); }} />}
      </div>

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
