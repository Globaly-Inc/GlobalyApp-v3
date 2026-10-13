"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Package, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SectionTabs } from "@/components/section-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  deleteBusinessThunk, fetchBusinesses, sendBulkClaimRequests, sendClaimRequest, updateBusinessPublished, updateBusinessStatus,
} from "../store/businesses-slice";
import type { Business, BusinessListParams, BusinessSort } from "../apis/types";
import { BusinessRow } from "./shared/business-row";
import { BusinessesTable } from "./shared/businesses-table";
import { useBusinessListParams } from "./use-business-list-params";
import { useBusinessSelection } from "./use-business-selection";
import { DeleteBusinessDialog } from "./shared/delete-business-dialog";
import { BulkDeleteDialog } from "./shared/bulk-delete-dialog";
import { ClaimRequestDialog, type ClaimRequestTarget } from "./shared/claim-request-dialog";
import { BusinessFiltersBar } from "./shared/business-filters-bar";
import { BusinessSelectionBar } from "./shared/business-selection-bar";
import { SendInvitationDialog } from "@/app/admin/platform/business-invites/components/send-invitation-dialog";
import { INVITE_ROLES } from "@/app/admin/platform/business-invites/const";
import { BusinessInvitesView } from "@/app/admin/platform/business-invites/components/business-invites-view";

export function BusinessesView() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { businesses, total, status, error } = useAppSelector((state) => state.platformBusinesses);
  const canInvite = INVITE_ROLES.includes(useAppSelector((state) => state.admin.me?.role) ?? "");
  const listParams = useBusinessListParams();
  const {
    tab, setTab, debouncedSearch, statusFilter, categoryFilter, sourceFilter, ownershipFilter, sort,
    page, setPage, limit, setLimit, resetPage,
  } = listParams;

  const {
    keyOf, selected, toggleOne, toggleAllVisible, clearSelection, allVisibleSelected, someSelected,
    selectedRefs, selectedUnclaimedRefs, selectedEligibleCount, selectedEligibleRefs,
  } = useBusinessSelection(businesses);
  const [publishBusyId, setPublishBusyId] = useState<number | null>(null);
  const [claimRequestBusy, setClaimRequestBusy] = useState(false);
  const [claimRequestTarget, setClaimRequestTarget] = useState<ClaimRequestTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Business | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitesReloadKey, setInvitesReloadKey] = useState(0);

  const buildBusinessesParams = () => ({
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    category: categoryFilter !== "all" ? Number(categoryFilter) : undefined,
    origin: sourceFilter !== "all" ? (sourceFilter as BusinessListParams["origin"]) : undefined,
    ownership: ownershipFilter !== "all" ? (ownershipFilter as "owned" | "unclaimed") : undefined,
    sort: sort as BusinessSort,
    page,
    limit,
  });

  const lastBusinessesFetchKey = useRef<string | null>(null);
  useEffect(() => {
    const params = buildBusinessesParams();
    const key = JSON.stringify(params);
    if (lastBusinessesFetchKey.current === key) return;
    lastBusinessesFetchKey.current = key;
    dispatch(fetchBusinesses(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, debouncedSearch, statusFilter, categoryFilter, sourceFilter, ownershipFilter, sort, page, limit]);

  // The claims tab is the same list, pre-filtered: anything an admin has sent a claim
  // request for and nobody has accepted yet. Accepted ones flip to "claimed" and drop out.
  const displayed = tab === "claims"
    ? businesses.filter((b) => b.claim_status === "claim_pending")
    : businesses;


  const runVerify = (b: Business) =>
    dispatch(updateBusinessStatus({ kind: b.kind, id: b.id, status: "verified" }))
      .unwrap()
      .then(() => {
        toast.success("Business verified");
        dispatch(fetchBusinesses(buildBusinessesParams()));
      })
      .catch((e: Error) => toast.error("Couldn't update status", { description: e.message }));

  const runSuspend = (b: Business) =>
    dispatch(updateBusinessStatus({ kind: b.kind, id: b.id, status: "suspended" }))
      .unwrap()
      .then(() => {
        toast.success("Business suspended");
        dispatch(fetchBusinesses(buildBusinessesParams()));
      })
      .catch((e: Error) => toast.error("Couldn't update status", { description: e.message }));

  const runSendClaimRequest = async () => {
    if (!claimRequestTarget) return;
    setClaimRequestBusy(true);
    try {
      if (claimRequestTarget.kind === "single") {
        const b = claimRequestTarget.business;
        await dispatch(sendClaimRequest({ kind: b.kind, id: b.id })).unwrap();
        // The link goes to the listing's own contact email when nobody owns it yet — see
        // sendClaimRequest / sendInstitutionClaimRequest on the backend.
        toast.success(`Claim request sent to ${b.owner_email ?? b.email ?? "the listed contact"}`);
      } else {
        const refs = selectedUnclaimedRefs();
        await dispatch(sendBulkClaimRequests(refs)).unwrap();
        toast.success(`Queued claim requests for ${refs.length} businesses`);
        clearSelection();
      }
      setClaimRequestTarget(null);
    } catch (e) {
      toast.error("Couldn't send claim request", { description: (e as Error).message });
    } finally {
      setClaimRequestBusy(false);
    }
  };

  const runTogglePublish = async (b: Business, next: boolean) => {
    setPublishBusyId(b.id);
    try {
      await dispatch(updateBusinessPublished({ kind: b.kind, id: b.id, is_published: next })).unwrap();
      toast.success(next ? "Business published" : "Business unpublished");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as Error).message });
    } finally {
      setPublishBusyId(null);
    }
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await dispatch(deleteBusinessThunk({ kind: deleteTarget.kind, id: deleteTarget.id })).unwrap();
      toast.success("Business deleted");
      setDeleteTarget(null);
      dispatch(fetchBusinesses(buildBusinessesParams()));
    } catch (e) {
      toast.error("Couldn't delete business", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  const bulkUpdateStatus = async (target: "verified" | "suspended") => {
    const refs = selectedEligibleRefs(target);
    if (refs.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.all(
      refs.map((r) => dispatch(updateBusinessStatus({ ...r, status: target })).unwrap().then(() => true).catch(() => false)),
    );
    const ok = results.filter(Boolean).length;
    setBulkBusy(false);
    clearSelection();
    toast[ok < refs.length ? "error" : "success"](`Updated ${ok} of ${refs.length}`);
    dispatch(fetchBusinesses(buildBusinessesParams()));
  };

  const bulkDelete = async () => {
    const refs = selectedRefs();
    if (refs.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.all(
      refs.map((r) => dispatch(deleteBusinessThunk(r)).unwrap().then(() => true).catch(() => false)),
    );
    const ok = results.filter(Boolean).length;
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    clearSelection();
    toast[ok < refs.length ? "error" : "success"](`Deleted ${ok} of ${refs.length}`);
    dispatch(fetchBusinesses(buildBusinessesParams()));
  };

  const list = (
    <>
    {/* With rows still on screen a failed search/page keeps showing them — say they're stale. */}
    {status === "failed" && displayed.length > 0 && (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Couldn&apos;t load businesses: {error}. Showing the last results.
      </p>
    )}
    <BusinessesTable
      loading={status === "loading"}
      empty={displayed.length === 0}
      // A failed load must not read as an empty platform.
      emptyTitle={status === "failed" ? `Couldn't load businesses: ${error}` : tab === "claims" ? "No pending claim requests" : "No businesses found"}
      selectAll={tab === "businesses" ? { checked: allVisibleSelected, onToggle: toggleAllVisible } : undefined}
    >
      {displayed.map((b) => (
        <BusinessRow
          key={keyOf(b)}
          business={b}
          selected={selected.has(keyOf(b))}
          onToggleSelect={() => toggleOne(keyOf(b))}
          onView={() => router.push(`/admin/platform/businesses/${b.id}?kind=${b.kind}`)}
          onVerify={() => runVerify(b)}
          onSuspend={() => runSuspend(b)}
          onTogglePublish={() => runTogglePublish(b, !b.is_published)}
          onDelete={() => setDeleteTarget(b)}
          onSendClaimRequest={() =>
            // Recipient decided here, from the row: the owner's address if this listing has an
            // owner, otherwise its own contact email. Same rule the backend applies.
            setClaimRequestTarget({ kind: "single", business: b, recipient: b.owner_email ?? b.email })
          }
          publishBusy={publishBusyId === b.id}
          claimRequestBusy={claimRequestBusy && claimRequestTarget?.kind === "single" && claimRequestTarget.business.id === b.id}
        />
      ))}
    </BusinessesTable>
    </>
  );

  return (
    <PageBody className="pb-20">
      <PageHeader title={<><Building2 /> Business Management</>} subtitle="Verify, Manage, and Invite Business Accounts.">
        {canInvite && (
          <Button variant="outline" className="cursor-pointer gap-1" onClick={() => setInviteOpen(true)}>
            <Send className="h-4 w-4" />
            Invite Business
          </Button>
        )}
        <Button className="cursor-pointer gap-1" onClick={() => router.push("/admin/platform/businesses/add")}>
          <Plus className="h-4 w-4" />
          Add Business
        </Button>
      </PageHeader>
      {canInvite && <SendInvitationDialog open={inviteOpen} onOpenChange={setInviteOpen} onSent={() => setInvitesReloadKey((k) => k + 1)} />}

      <SectionTabs
        options={[
          { value: "businesses", label: "Businesses" },
          ...(canInvite ? [{ value: "invites" as const, label: "Invites" }] : []),
          { value: "services", label: "Services" },
          { value: "claims", label: "Claim Requests" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "invites" && canInvite ? (
        <BusinessInvitesView reloadKey={invitesReloadKey} />
      ) : tab === "services" ? (
        <EmptyState icon={Package} title="Services management is coming soon." />
      ) : tab === "claims" ? (
        list
      ) : (
        <>
          <BusinessFiltersBar params={listParams} total={total} />

          {list}

          {status !== "loading" && total > 0 && (
            <Pagination
              page={page}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(v) => resetPage(setLimit, v)}
              align="end"
            />
          )}

          {someSelected && (
            <BusinessSelectionBar
              count={selected.size}
              verifiableCount={selectedEligibleCount("verified")}
              suspendableCount={selectedEligibleCount("suspended")}
              unclaimedCount={selectedUnclaimedRefs().length}
              bulkBusy={bulkBusy}
              onClear={clearSelection}
              onVerify={() => bulkUpdateStatus("verified")}
              onSuspend={() => bulkUpdateStatus("suspended")}
              onDeleteClick={() => setBulkDeleteOpen(true)}
              onSendClaimRequestsClick={() => setClaimRequestTarget({ kind: "bulk", count: selectedUnclaimedRefs().length })}
            />
          )}
        </>
      )}

      <DeleteBusinessDialog
        business={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={runDelete}
        deleting={deleting}
      />
      <BulkDeleteDialog
        open={bulkDeleteOpen}
        count={selected.size}
        onOpenChange={setBulkDeleteOpen}
        onConfirm={bulkDelete}
        deleting={bulkBusy}
      />
      <ClaimRequestDialog
        target={claimRequestTarget}
        onOpenChange={(open) => !open && setClaimRequestTarget(null)}
        onConfirm={runSendClaimRequest}
        sending={claimRequestBusy}
      />
    </PageBody>
  );
}
