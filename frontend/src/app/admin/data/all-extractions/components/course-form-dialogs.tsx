"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CourseBulkUpdateForm, type CourseBulkLinkSelection, type CourseBulkUpdatePatch } from "./course-bulk-update-form";
import { CourseForm } from "./course-form";
import type { CreateCourseParams } from "../apis/types";

// Groups the Courses tab's "Add Course" and "Bulk Update" dialogs so courses-tab.tsx
// doesn't carry their JSX inline.
export function CourseFormDialogs({
  jobId,
  adding,
  onAddingChange,
  onCreate,
  bulkUpdating,
  onBulkUpdatingChange,
  bulkCount,
  onBulkUpdate,
  saving,
}: Readonly<{
  jobId: string;
  adding: boolean;
  onAddingChange: (v: boolean) => void;
  onCreate: (values: CreateCourseParams) => void;
  bulkUpdating: boolean;
  onBulkUpdatingChange: (v: boolean) => void;
  bulkCount: number;
  onBulkUpdate: (patch: CourseBulkUpdatePatch, linkSelection: CourseBulkLinkSelection) => void;
  saving: boolean;
}>) {
  return (
    <>
      <Dialog open={adding} onOpenChange={onAddingChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
          <CourseForm saving={saving} onCancel={() => onAddingChange(false)} onSave={onCreate} />
        </DialogContent>
      </Dialog>

      <Dialog open={bulkUpdating} onOpenChange={onBulkUpdatingChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg p-0 border-0 bg-transparent shadow-none">
          <CourseBulkUpdateForm
            jobId={jobId}
            count={bulkCount}
            saving={saving}
            onCancel={() => onBulkUpdatingChange(false)}
            onSave={onBulkUpdate}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
