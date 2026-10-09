"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, GitBranch, Link2, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMe, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchBranches, deleteBranch, convertCampus } from "../../store/business-profile-detail-slice";
import type { Branch } from "../../apis/types";
import { LinkBranchDialog } from "../branches/link-branch-dialog";
import { DeleteBranchDialog } from "../branches/delete-branch-dialog";
import { HeadOfficeCard } from "../branches/head-office-card";
import { BranchRow } from "../branches/branch-row";
import type { Country } from "@/app/geo/apis";

const PAGE_SIZE = 10;

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
  const [page, setPage] = useState(1);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search, unless the user is already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Listing converts any extracted campuses into real branch orgs server-side — refresh /auth/me
  // once after the first load so the org switcher shows them without a reload.
  const meRefreshedRef = useRef(false);
  const fetchPage = (p: number) => {
    dispatch(fetchBranches({ id: businessId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } }))
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
  }, [dispatch, businessId, search]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const handleDelete = async () => {
    if (!deletingBranch) return;
    const id = deletingBranch.id;
    setDeleting(true);
    try {
      // Slide the row out behind the closing dialog before the reducer drops it from the list.
      setDeletingBranch(null);
      setLeavingId(id);
      await new Promise((r) => setTimeout(r, 300));
      await dispatch(deleteBranch({ id: businessId, branchId: id })).unwrap();
      toast.success("Branch removed");
    } catch (e) {
      toast.error("Couldn't remove branch", { description: (e as Error).message });
    } finally {
      setLeavingId(null);
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
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed py-10 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">{search ? `No branches match “${search}”` : "No branches yet"}</p>
        <p className="text-xs text-muted-foreground">
          {search
            ? "Try a shorter name."
            : isInstitution ? "Create a branch to get started." : "Link an existing business or create a branch to get started."}
        </p>
      </div>
    );
  } else {
    list = (
      // Branches hang off the head office card above: a connector line with a stub into each row.
      <div className="relative flex flex-col gap-2 pl-7 max-sm:pl-5">
        <span aria-hidden className="animate-grow-y absolute -top-2.5 bottom-7 left-3 w-0.5 rounded-full bg-border max-sm:left-2" />
        {branches.map((b, i) => (
          <BranchRow
            key={b.id}
            branch={b}
            index={i}
            logo={logoFor(b)}
            query={search.trim()}
            leaving={leavingId === b.id}
            converting={convertingId === b.id}
            convertBusy={convertingId !== null}
            onEdit={() => {
              if (b.extracted) editExtracted(b.id);
              // A branch this org created opens the full edit form (details are written to the branch
              // org itself). One linked from elsewhere is someone else's org — only the link
              // (type, shared services) is edited here.
              else if ((b.linked_business_id != null || b.linked_institution_id != null) && !b.owned) {
                setEditingLinkedBranch(b);
                setLinkOpen(true);
              } else router.push(`/business/profile/${businessId}/branches/${b.id}/edit${orgQuery}`);
            }}
            onDelete={() => setDeletingBranch(b)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GitBranch className="h-[18px] w-[18px]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Branches</h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-primary">{branchesTotal}</span>
            </div>
            <p className="text-xs text-muted-foreground">Campuses and offices under your head office</p>
          </div>
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
          <Button
            className="group/create h-10 transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_var(--color-primary)] active:translate-y-0 active:scale-[.98]"
            onClick={() => router.push(`/business/profile/${businessId}/branches/add${orgQuery}`)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover/create:rotate-90" /> Create branch
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            className="h-10 border-transparent bg-muted/60 pl-9 transition-[background-color,border-color,box-shadow] focus-visible:border-primary focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-primary/15"
            placeholder="Search branches by name..."
            aria-label="Search branches"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <HeadOfficeCard countries={countries} />
        {list}
      </div>

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
