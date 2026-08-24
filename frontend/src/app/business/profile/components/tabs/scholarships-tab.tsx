"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchScholarships, deleteScholarship, toggleScholarshipPublished } from "../../store/business-profile-detail-slice";
import type { Scholarship } from "../../apis/types";
import { CreateScholarshipDialog } from "../scholarships/create-scholarship-dialog";
import { DeleteScholarshipDialog } from "../scholarships/delete-scholarship-dialog";

const PAGE_SIZE = 10;

export function ScholarshipsTab({ businessId }: Readonly<{ businessId: number }>) {
  const dispatch = useAppDispatch();
  const { items: scholarships, status, total } = useAppSelector((state) => state.businessProfileDetail.scholarships);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Scholarship | null>(null);
  const [deleting, setDeleting] = useState<Scholarship | null>(null);
  const [removing, setRemoving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchPage = (p: number) => {
    dispatch(fetchScholarships({ id: businessId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } }));
  };

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchPage(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, businessId, search]);

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

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (scholarships.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <GraduationCap className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No scholarships yet</p>
        <p className="text-xs text-muted-foreground">Create a scholarship to list it for students.</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {scholarships.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.title}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{s.coverage_type.replaceAll("_", " ")}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[s.country, s.deadline ? `Deadline ${s.deadline}` : null].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Switch checked={s.is_published} onCheckedChange={(v) => handleTogglePublished(s, v)} />
                <span className="text-xs text-muted-foreground">{s.is_published ? "Published" : "Draft"}</span>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={() => { setEditing(s); setCreateOpen(true); }} aria-label="Edit scholarship">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(s)} aria-label="Remove scholarship">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Scholarships</span>
          <Badge variant="secondary">{total}</Badge>
        </div>
        <Button className="h-10" onClick={() => { setEditing(null); setCreateOpen(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Create scholarship
        </Button>
      </div>

      <div className="mb-3 flex items-center justify-end">
        <div className="relative w-1/4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-9" placeholder="Search scholarships by title..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {list}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <CreateScholarshipDialog open={createOpen} onOpenChange={setCreateOpen} businessId={businessId} editing={editing} />
      <DeleteScholarshipDialog scholarship={deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={handleDelete} deleting={removing} />
    </div>
  );
}
