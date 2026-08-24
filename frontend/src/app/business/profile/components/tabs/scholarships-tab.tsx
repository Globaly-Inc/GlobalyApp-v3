"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, GraduationCap, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchScholarships, deleteScholarship, toggleScholarshipPublished } from "../../store/business-profile-detail-slice";
import type { Scholarship } from "../../apis/types";
import { CreateScholarshipDialog } from "../scholarships/create-scholarship-dialog";
import { DeleteScholarshipDialog } from "../scholarships/delete-scholarship-dialog";

const PAGE_SIZE = 10;

function StatCard({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <Card className="gap-1 py-3">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

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

  const publishedCount = scholarships.filter((s) => s.is_published).length;
  const draftCount = scholarships.length - publishedCount;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Scholarships</h2>
          <p className="text-sm text-muted-foreground">Offer scholarships to attract prospective students.</p>
        </div>
        <Button className="h-10" onClick={() => { setEditing(null); setCreateOpen(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New scholarship
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Total" value={total} />
        <StatCard label="Published" value={publishedCount} />
        <StatCard label="Drafts" value={draftCount} />
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-10 pl-9" placeholder="Search your scholarships..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : scholarships.length === 0 ? (
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
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-left">Country</th>
                <th className="p-3 text-left">Basis</th>
                <th className="p-3 text-left">Coverage</th>
                <th className="p-3 text-left">Deadline</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scholarships.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3 font-medium">{s.title}</td>
                  <td className="p-3 text-muted-foreground">{s.country ?? "—"}</td>
                  <td className="p-3 text-muted-foreground capitalize">{s.basis?.replaceAll("_", " ") ?? "—"}</td>
                  <td className="p-3 capitalize">{s.coverage_type.replaceAll("_", " ")}</td>
                  <td className="p-3 whitespace-nowrap">{s.deadline ? new Date(s.deadline).toLocaleDateString() : "—"}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.is_published ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {s.is_published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleTogglePublished(s, !s.is_published)}>
                        {s.is_published ? "Unpublish" : "Publish"}
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => { setEditing(s); setCreateOpen(true); }} aria-label="Edit scholarship">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        render={<a href={`/scholarships/${s.slug}`} target="_blank" rel="noopener noreferrer" aria-label="Preview scholarship" />}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(s)} aria-label="Remove scholarship">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <CreateScholarshipDialog open={createOpen} onOpenChange={setCreateOpen} businessId={businessId} editing={editing} />
      <DeleteScholarshipDialog scholarship={deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={handleDelete} deleting={removing} />
    </div>
  );
}
