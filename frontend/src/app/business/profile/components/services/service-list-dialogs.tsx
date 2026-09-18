"use client";

import type { BusinessService } from "../../apis/types";
import { DeleteServiceDialog } from "./delete-service-dialog";
import { ServiceBulkAssignDialog } from "./service-bulk-assign-dialog";
import { ServiceBulkUpdateDialog } from "./service-bulk-update-dialog";
import { ServiceFeeDialog } from "./service-fee-dialog";

/** The four modals the service list can raise, kept together so the tab itself stays readable. */
export function ServiceListDialogs({
  selectedIds,
  selectedServices,
  orgBase,
  bulkUpdateOpen,
  onBulkUpdateOpenChange,
  onBulkUpdated,
  bulkAssignOpen,
  onBulkAssignOpenChange,
  onBulkAssigned,
  feeService,
  onFeeServiceClose,
  deletingService,
  onDeletingServiceClose,
  onConfirmDelete,
  deleting,
}: Readonly<{
  selectedIds: string[];
  /** The same selection as objects — bulk update needs each row's category, not just its id. */
  selectedServices: BusinessService[];
  orgBase: string;
  bulkUpdateOpen: boolean;
  onBulkUpdateOpenChange: (open: boolean) => void;
  onBulkUpdated: () => void;
  bulkAssignOpen: boolean;
  onBulkAssignOpenChange: (open: boolean) => void;
  onBulkAssigned: () => void;
  feeService: BusinessService | null;
  onFeeServiceClose: () => void;
  deletingService: BusinessService | null;
  onDeletingServiceClose: () => void;
  onConfirmDelete: () => void;
  deleting: boolean;
}>) {
  return (
    <>
      <ServiceBulkUpdateDialog
        open={bulkUpdateOpen}
        onOpenChange={onBulkUpdateOpenChange}
        services={selectedServices}
        orgBase={orgBase}
        onUpdated={onBulkUpdated}
      />
      <ServiceBulkAssignDialog
        open={bulkAssignOpen}
        onOpenChange={onBulkAssignOpenChange}
        selectedIds={selectedIds}
        orgBase={orgBase}
        onAssigned={onBulkAssigned}
      />
      <ServiceFeeDialog service={feeService} orgBase={orgBase} onOpenChange={(open) => !open && onFeeServiceClose()} />
      <DeleteServiceDialog
        service={deletingService}
        onOpenChange={(open) => !open && onDeletingServiceClose()}
        onConfirm={onConfirmDelete}
        deleting={deleting}
      />
    </>
  );
}
