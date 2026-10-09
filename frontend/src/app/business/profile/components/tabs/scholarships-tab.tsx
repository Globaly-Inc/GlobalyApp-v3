"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchScholarships, deleteScholarship, toggleScholarshipPublished } from "../../store/business-profile-detail-slice";
import type { Scholarship } from "../../apis/types";
import { CreateScholarshipDialog } from "../scholarships/create-scholarship-dialog";
import { DeleteScholarshipDialog } from "../scholarships/delete-scholarship-dialog";
import { ScholarshipImportDialog } from "../scholarships/scholarship-import-dialog";
import { BusinessScholarshipsTable } from "../scholarships/business-scholarships-table";
import { PortalPageHeader } from "../portal-ui/portal-page-header";
import { PortalAddButton } from "../portal-ui/portal-add-button";
import { PortalStats } from "../portal-ui/portal-stats";
import { PortalStatTile } from "../portal-ui/portal-stat-tile";
import { ScholarshipSearch } from "../scholarships/scholarship-search";
import { ScholarshipsEmptyState } from "../scholarships/scholarships-empty-state";

const PAGE_SIZE = 10;

export function ScholarshipsTab({ businessId }: Readonly<{ businessId: number }>) {
  const dispatch = useAppDispatch();
  const { items: scholarships, status, total } = useAppSelector((state) => state.businessProfileDetail.scholarships);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Scholarship | null>(null);
  const [deleting, setDeleting] = useState<Scholarship | null>(null);
  const [removing, setRemoving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchPage = (p: number) => {
    dispatch(fetchScholarships({ id: businessId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } }));
  };

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchPage(1);
      return;
    }
    setPage(1);
    const timer = setTimeout(() => fetchPage(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await dispatch(deleteScholarship({ id: businessId, scholarshipId: deleting.id })).unwrap();
      toast.success("Scholarship removed");
      setDeleting(null);
    } catch (e) {
      toast.error("Couldn't remove scholarship", { description: (e as Error).message });
    } finally {
      setRemoving(false);
    }
  };

  const handleTogglePublished = async (scholarship: Scholarship, is_published: boolean) => {
    try {
      await dispatch(toggleScholarshipPublished({ id: businessId, scholarshipId: scholarship.id, is_published })).unwrap();
    } catch (e) {
      toast.error("Couldn't update scholarship", { description: (e as Error).message });
    }
  };

  // Tiles count the rows on this page — the API only totals the list.
  const onPage = total > scholarships.length ? " (this page)" : "";
  const count = (f: (s: Scholarship) => boolean) => scholarships.filter(f).length;
  const missing = scholarships.filter((s) => s.coverage_amount == null || !s.deadline).length;
  const openEdit = (s: Scholarship) => { setEditing(s); setCreateOpen(true); };

  return (
    <div className="flex flex-col gap-4">
      <PortalPageHeader title="Scholarships" count={total} subtitle="Offer scholarships to attract prospective students.">
        <Button variant="outline" className="h-10 gap-1.5 rounded-[10px] font-semibold" onClick={() => setImportOpen(true)}>
          <UploadCloud className="h-4 w-4" /> Bulk import
        </Button>
        <PortalAddButton onClick={() => { setEditing(null); setCreateOpen(true); }}>New scholarship</PortalAddButton>
      </PortalPageHeader>

      <PortalStats>
        <PortalStatTile label={`Full tuition${onPage}`} value={count((s) => s.coverage_type === "full_tuition")} />
        <PortalStatTile label={`Stipends${onPage}`} value={count((s) => s.coverage_type === "stipend" || s.coverage_type === "living_allowance")} />
        <PortalStatTile label={`Published${onPage}`} value={count((s) => s.is_published)} />
        <PortalStatTile label={`Missing amount or deadline${onPage}`} value={missing} warn />
      </PortalStats>

      {/* The business list API filters by search only, so no dropdowns here. */}
      <div className="flex flex-wrap items-center gap-2">
        <ScholarshipSearch value={search} onChange={setSearch} />
      </div>

      <div>
        {status === "loading" ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : scholarships.length === 0 ? (
          <ScholarshipsEmptyState onClear={search ? () => setSearch("") : undefined} />
        ) : (
          <BusinessScholarshipsTable rows={scholarships} onEdit={openEdit} onDelete={setDeleting} onTogglePublished={handleTogglePublished} />
        )}
        {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
      </div>

      <CreateScholarshipDialog open={createOpen} onOpenChange={setCreateOpen} businessId={businessId} editing={editing} />
      <DeleteScholarshipDialog scholarship={deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={handleDelete} deleting={removing} />
      <ScholarshipImportDialog open={importOpen} onOpenChange={setImportOpen} businessId={businessId} />
    </div>
  );
}
