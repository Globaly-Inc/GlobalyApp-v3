"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BusinessService } from "../../apis/types";
import { CourseFeesTab } from "./tabs/course-fees-tab";

/**
 * The fee schedule for one service without leaving the list — V1's ServiceFeeEditor. It reuses
 * the editor page's fees tab rather than duplicating the CRUD, so both stay in step.
 */
export function ServiceFeeDialog({
  service,
  orgBase,
  onOpenChange,
}: Readonly<{ service: BusinessService | null; orgBase: string; onOpenChange: (open: boolean) => void }>) {
  return (
    <Dialog open={!!service} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fees — {service?.name}</DialogTitle>
        </DialogHeader>
        {/* Keyed on the service so switching rows remounts the tab instead of showing stale fees. */}
        {service && <CourseFeesTab key={service.id} serviceId={service.id} orgBase={orgBase} />}
      </DialogContent>
    </Dialog>
  );
}
