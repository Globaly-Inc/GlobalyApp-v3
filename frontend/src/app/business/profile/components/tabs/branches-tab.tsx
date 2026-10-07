"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, GitBranch, Link2, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OriginChip } from "../origin-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMe, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchBranches, deleteBranch, convertCampus } from "../../store/business-profile-detail-slice";
import type { Branch, BranchFilter } from "../../apis/types";
import { LinkBranchDialog } from "../branches/link-branch-dialog";
import { DeleteBranchDialog } from "../branches/delete-branch-dialog";
import { HeadOfficeCard } from "../branches/head-office-card";
import type { Country } from "@/app/geo/apis";

const PAGE_SIZE = 10;

const FILTER_OPTIONS: { value: BranchFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "branches_only", label: "Branches only" },
  { value: "linked_branches", label: "Linked branches" },
];

export function BranchesTab({
  businessId,
  isInstitution,
  countries = [],
}: Readonly<{ businessId: number; isInstitution: boolean; countries?: Country[] }>) {
  // Names the exact org in the link — ids alone can collide across businesses and institutions.
  const authUser = useAuthState().user;
  const activeOrgId = authUser?.orgId;
  const parentLogo = useAppSelector((s) => s.businessOnboarding.profile?.logo_url ?? null);
  // A created branch is owned by this user, so its signed logo URL is already in /auth/me. A
  // same-company branch (or an extracted campus) without its own logo shows the parent's brand.
  const logoFor = (b: Branch) => {
    const own = b.linked_business_id != null
      ? authUser?.businesses?.find((o) => o.id === b.linked_business_id)?.logo_url
      : b.linked_institution_id != null
        ? authUser?.institutions?.find((o) => o.id === b.linked_institution_id)?.logo_url
        : null;
    return own || (b.extracted || b.branch_type === "same_company" ? parentLogo : null);
  };
  const orgQuery = activeOrgId ? `?org=${encodeURIComponent(activeOrgId)}` : "";
  const router = useRouter();
  const [convertingId, setConvertingId] = useState<string | null>(null);
  // An extracted campus has no branch org yet — make it one, then edit that like any branch.
  const editExtracted = async (campusId: string) => {
    setConvertingId(campusId);
    try {
      const { branch_id } = await dispatch(convertCampus({ campusId })).unwrap();
      router.push(`/business/profile/${businessId}/branches/${branch_id}/edit${orgQuery}`);
    } catch (e) {
      toast.error("Couldn't open this branch for editing", { description: (e as Error).message });
      setConvertingId(null);
    }
  };
  const dispatch = useAppDispatch();
  const { items: branches, status, total: branchesTotal, ownerId } = useAppSelector((state) => state.businessProfileDetail.branches);
  // The list is shared with the Locations card and outlives a switch to another business, and the
  // first fetch is debounced — so until it holds THIS business's rows the tab shows its spinner
  // rather than whichever rows happen to be in the store.
  const loadingBranches = status === "loading" || ownerId !== businessId;
  const [editingLinkedBranch, setEditingLinkedBranch] = useState<Branch | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState<BranchFilter>("all");
  const [page, setPage] = useState(1);

  // Listing converts any extracted campuses into real branch orgs server-side — refresh /auth/me
  // once after the first load so the org switcher shows them without a reload.
  const meRefreshedRef = useRef(false);
  const fetchPage = (p: number) => {
    dispatch(fetchBranches({ id: businessId, params: { search: search || undefined, filter_branch: filterBranch, page: p, limit: PAGE_SIZE } }))
      .then(() => {
        if (meRefreshedRef.current) return;
        meRefreshedRef.current = true;
        dispatch(fetchMe());
      });
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
  if (loadingBranches) {
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
        <p className="text-xs text-muted-foreground">
          {isInstitution ? "Create a branch to get started." : "Link an existing business or create a branch to get started."}
        </p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {branches.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-muted text-xs font-semibold uppercase">
                {logoFor(b) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
                  <img src={logoFor(b)!} alt="" className="size-full object-contain p-0.5" />
                ) : b.name.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{b.name}</span>
                  {b.is_primary && <Badge className="text-[10px]">Head Office</Badge>}
                  {b.origin && <OriginChip origin={b.origin} />}
                  {(b.linked_business_id != null || b.linked_institution_id != null) && (
                    <Badge variant="outline" className="text-[10px] capitalize">{b.branch_type.replaceAll("_", " ")}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{[b.city, b.state, b.country].filter(Boolean).join(", ") || "—"}</p>
              </div>
            </div>
            {b.extracted && (
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={convertingId !== null}
                onClick={() => editExtracted(b.id)}
                aria-label="Edit branch"
                title="Edit — sets this extracted branch up so you can complete its details"
              >
                {convertingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              </Button>
            )}
            {!b.extracted && <div className="flex items-center gap-1">
              {/* A branch this org created opens the full edit form (details are written to the branch
                 org itself). One linked from elsewhere is someone else's org — only the link
                 (type, shared services) is edited here. */}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  if ((b.linked_business_id != null || b.linked_institution_id != null) && !b.owned) {
                    setEditingLinkedBranch(b);
                    setLinkOpen(true);
                  } else {
                    router.push(`/business/profile/${businessId}/branches/${b.id}/edit${orgQuery}`);
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
            </div>}
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
          {/* Linking another registered business as a branch has no institution twin (see
             business-branches.service.ts's "Institution twins" section) — an institution's
             campuses aren't other registered orgs. */}
          {!isInstitution && (
            <Button className="h-10" variant="outline" onClick={() => { setEditingLinkedBranch(null); setLinkOpen(true); }}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" /> Link existing
            </Button>
          )}
          <Button className="h-10" onClick={() => router.push(`/business/profile/${businessId}/branches/add${orgQuery}`)}>
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

      <HeadOfficeCard countries={countries} />
      {list}

      {branchesTotal > 0 && (
        <Pagination page={page} total={branchesTotal} limit={PAGE_SIZE} onPageChange={handlePageChange} />
      )}

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
