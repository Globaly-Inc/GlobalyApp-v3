"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, GitBranch, Link2, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBranches, deleteBranch } from "../../store/businesses-slice";
import type { Branch, BranchFilter } from "../../apis/types";
import { CreateBranchDialog } from "../branches/create-branch-dialog";
import { LinkBranchDialog } from "../branches/link-branch-dialog";
import { DeleteBranchDialog } from "../branches/delete-branch-dialog";

const PAGE_SIZE = 10;

const FILTER_OPTIONS: { value: BranchFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "branches_only", label: "Branches only" },
  { value: "linked_branches", label: "Linked branches" },
];

export function BranchesTab({ businessId }: Readonly<{ businessId: number }>) {
  const dispatch = useAppDispatch();
  const { items: branches, status, total: branchesTotal } = useAppSelector((state) => state.platformBusinesses.branches);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingLinkedBranch, setEditingLinkedBranch] = useState<Branch | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState<BranchFilter>("all");
  const [page, setPage] = useState(1);

  const fetchPage = (p: number) => {
    dispatch(fetchBranches({ id: businessId, params: { search: search || undefined, filter_branch: filterBranch, page: p, limit: PAGE_SIZE } }));
  };

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchPage(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, businessId, search, filterBranch]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const handleDelete = async () => {
    if (!deletingBranch) return;
    setDeleting(true);
    try {
      await dispatch(deleteBranch({ id: businessId, branchId: deletingBranch.id })).unwrap();
      toast.success("Branch removed");
      setDeletingBranch(null);
    } catch (e) {
      toast.error("Couldn't remove branch", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (branches.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No branches yet</p>
        <p className="text-xs text-muted-foreground">Link an existing business or create a branch to get started.</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {branches.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xs font-semibold uppercase">
                {b.name.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{b.name}</span>
                  {b.is_primary && <Badge className="text-[10px]">Head Office</Badge>}
                  {b.linked_business_id != null && (
                    <Badge variant="outline" className="text-[10px] capitalize">{b.branch_type.replaceAll("_", " ")}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{[b.city, b.state, b.country].filter(Boolean).join(", ") || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  if (b.linked_business_id != null) {
                    setEditingLinkedBranch(b);
                    setLinkOpen(true);
                  } else {
                    setEditingBranch(b);
                    setCreateOpen(true);
                  }
                }}
                aria-label="Edit branch"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {!b.is_primary && (
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeletingBranch(b)} aria-label="Remove branch">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
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
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Branches</span>
          <Badge variant="secondary">{branchesTotal}</Badge>
        </div>
        <div className="flex gap-2">
          <Button className="h-10" variant="outline" onClick={() => { setEditingLinkedBranch(null); setLinkOpen(true); }}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" /> Link existing
          </Button>
          <Button className="h-10" onClick={() => { setEditingBranch(null); setCreateOpen(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Create branch
          </Button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-end gap-2">
        <div className="relative w-1/4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Search branches by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Combobox
          className="w-48"
          value={filterBranch}
          onChange={(v) => setFilterBranch(v as BranchFilter)}
          options={FILTER_OPTIONS}
          placeholder="Filter"
        />
      </div>

      {list}

      {branchesTotal > 0 && (
        <Pagination page={page} total={branchesTotal} limit={PAGE_SIZE} onPageChange={handlePageChange} />
      )}

      <CreateBranchDialog open={createOpen} onOpenChange={setCreateOpen} businessId={businessId} editBranch={editingBranch} />
      <LinkBranchDialog open={linkOpen} onOpenChange={setLinkOpen} businessId={businessId} editBranch={editingLinkedBranch} />
      <DeleteBranchDialog
        branch={deletingBranch}
        onOpenChange={(open) => { if (!open) setDeletingBranch(null); }}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
