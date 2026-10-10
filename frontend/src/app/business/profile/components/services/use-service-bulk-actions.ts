"use client";

import { toast } from "sonner";
import { useAppDispatch } from "@/lib/hooks";
import { deleteServiceThunk, toggleServicePublished } from "../../store/business-profile-detail-slice";
import type { BusinessService, ServiceSearchParams } from "../../apis/types";
import { needsApproval } from "./use-course-approval";
import { useSelectAllServices } from "./use-select-all-services";

/** The Services tab's bulk actions over a selection that may span every page ("Select all N"). */
export function useServiceBulkActions({
  businessId, services, pageRows, selectedIds, setSelectedIds, approve, scopeKey, scopeParams, reload,
}: {
  businessId: number;
  services: BusinessService[];
  pageRows: BusinessService[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  approve: (ids: string[]) => Promise<void>;
  scopeKey: string;
  scopeParams: Omit<ServiceSearchParams, "page" | "limit">;
  reload: () => void;
}) {
  const dispatch = useAppDispatch();
  // Selection can span every page ("Select all N") — then rows come from the fully loaded list.
  const scope = useSelectAllServices(scopeKey, scopeParams);
  const selectedRows = (scope.allRows ?? services).filter((s) => selectedIds.has(s.id));
  const pageAllSelected = pageRows.length > 0 && pageRows.every((s) => selectedIds.has(s.id));
  const clearSelection = () => {
    setSelectedIds(new Set());
    scope.clear();
  };
  // Bulk actions can touch rows off this page, so reload it afterwards.
  const afterBulk = () => {
    clearSelection();
    reload();
  };
  // A rejected thunk still resolves its dispatch — unwrap so failures are seen, not hidden.
  const failedOf = async (rows: BusinessService[], call: (s: BusinessService) => Promise<unknown>) => {
    const results = await Promise.allSettled(rows.map(call));
    return rows.filter((_, i) => results[i]!.status === "rejected");
  };
  // A partial result: the completed rows leave the selection (and the stale "Select all" list goes),
  // the failed ones stay selected so staff can retry exactly those, and the message names them.
  const keepOnlyFailed = (failed: BusinessService[], total: number, verb: string) => {
    const names = failed.slice(0, 3).map((s) => s.name).join(", ") + (failed.length > 3 ? ` +${failed.length - 3} more` : "");
    toast.error(`${failed.length} of ${total} couldn't be ${verb}`, { description: `Still selected: ${names}` });
    scope.clear();
    setSelectedIds(new Set(failed.map((s) => s.id)));
    reload();
  };

  const handleBulkPublish = async (is_published: boolean) => {
    // Only approved courses can be published — skip the rest instead of failing the whole batch.
    const chosen = selectedRows;
    const rows = is_published ? chosen.filter((s) => !needsApproval(s)) : chosen;
    const failed = await failedOf(rows, (s) => dispatch(toggleServicePublished({ id: businessId, serviceId: s.id, is_published })).unwrap());
    const skipped = chosen.length - rows.length;
    if (failed.length > 0) return keepOnlyFailed(failed, rows.length, is_published ? "published" : "unpublished");
    toast.success(is_published ? "Services published" : "Services unpublished",
      skipped > 0 ? { description: `${skipped} not yet approved — approve them first.` } : undefined);
    afterBulk();
  };

  const handleBulkApprove = async () => {
    await approve(selectedRows.filter(needsApproval).map((s) => s.id));
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const failed = await failedOf(selectedRows, (s) => dispatch(deleteServiceThunk({ id: businessId, serviceId: s.id })).unwrap());
    if (failed.length > 0) return keepOnlyFailed(failed, selectedRows.length, "deleted");
    toast.success("Services deleted");
    afterBulk();
  };

  return { scope, selectedRows, pageAllSelected, clearSelection, handleBulkPublish, handleBulkApprove, handleBulkDelete };
}
