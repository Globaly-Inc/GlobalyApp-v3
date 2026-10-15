import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import { allExtractionsApi } from "../apis";
import { pendingCourseLinks, runLimited } from "../utils";
import type { CourseBulkLinkSelection, CourseBulkUpdatePatch } from "./course-bulk-update-form";
import type { useConfirmDelete } from "./use-confirm-delete";
import type { SortOrder } from "../const";
import type { CourseFilters, CourseFull, CourseLinks } from "../apis/types";

export const DEFAULT_PAGE_SIZE = 10;

const BULK_UPDATE_CONCURRENCY = 6;

type LoadOverrides = { page?: number; limit?: number; search?: string; status?: string; sort?: SortOrder; filters?: CourseFilters };

export type CourseActionDeps = {
  jobId: string;
  links: CourseLinks | null;
  selectedIds: string[];
  confirm: ReturnType<typeof useConfirmDelete>["confirm"];
  load: (overrides?: LoadOverrides) => Promise<boolean>;
  onReload: () => void;
  resetListState: () => void;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setCourses: Dispatch<SetStateAction<CourseFull[]>>;
  setTotal: Dispatch<SetStateAction<number>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setBulkUpdating: Dispatch<SetStateAction<boolean>>;
};

/** The courses tab's mutation handlers (delete, bulk delete/update/verify, approve all), moved out of courses-tab.tsx verbatim. */
export function createCourseActions({
  jobId, links, selectedIds, confirm, load, onReload, resetListState,
  setSaving, setCourses, setTotal, setSelectedIds, setBulkUpdating,
}: CourseActionDeps) {
  const deleteCourse = async (id: string) => {
    if (!(await confirm("Delete course?", "This will permanently delete the course and its linked fees, intakes, and other data."))) {
      return;
    }
    setSaving(true);
    try {
      await allExtractionsApi.deleteCourse(id);
      toast.success("Course deleted");
      resetListState();
      await load({ page: 1, limit: DEFAULT_PAGE_SIZE, search: "", status: "all", sort: "name_asc", filters: {} });
      onReload();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const bulkDelete = async () => {
    const many = selectedIds.length > 1;
    if (!(await confirm(many ? `Delete ${selectedIds.length} courses?` : "Delete course?", "This will permanently delete the selected courses and their linked fees, intakes, and other data."))) {
      return;
    }
    setSaving(true);
    try {
      const { queued } = await allExtractionsApi.bulkDeleteCourses(selectedIds);
      toast.success(`${queued} course${many ? "s" : ""} queued for deletion`);
      // Fire-and-forget — a background worker does the actual deletes. Remove the rows
      // optimistically first (the server hasn't caught up yet), then reset every other
      // list control back to defaults and force a reload with those defaults explicitly
      // (resetListState's setState calls haven't committed yet, so `load()` alone would
      // still read the pre-reset page/search/status from this render's closure).
      const deletedIds = new Set(selectedIds);
      setCourses((prev) => prev.filter((c) => !deletedIds.has(c.id)));
      setTotal((prev) => Math.max(0, prev - deletedIds.size));
      resetListState();
      await load({ page: 1, limit: DEFAULT_PAGE_SIZE, search: "", status: "all", sort: "name_asc", filters: {} });
      onReload();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const bulkUpdate = async (patch: CourseBulkUpdatePatch, linkSelection: CourseBulkLinkSelection) => {
    setSaving(true);
    try {
      const patchTasks = Object.keys(patch).length
        ? selectedIds.map((id) => () => allExtractionsApi.saveAndLearn({ table: "extraction_courses", id, patch, job_id: jobId }))
        : [];

      const linkTasks = pendingCourseLinks(
        [
          { junction: "course-fees", entityIds: linkSelection.feeIds, assignments: links?.fee_assignments, entityCol: "course_fee_id" },
          { junction: "intakes", entityIds: linkSelection.intakeIds, assignments: links?.intake_assignments, entityCol: "intake_id" },
          { junction: "eligibility-requirements", entityIds: linkSelection.eligibilityIds, assignments: links?.eligibility_assignments, entityCol: "eligibility_requirement_id" },
          { junction: "study-options", entityIds: linkSelection.studyOptionIds, assignments: links?.study_option_assignments, entityCol: "study_option_id" },
        ],
        selectedIds,
      ).map((l) => () => allExtractionsApi.assignJunction(l.junction, { job_id: jobId, course_id: l.course_id, entity_id: l.entity_id }));

      const results = await runLimited([...patchTasks, ...linkTasks], BULK_UPDATE_CONCURRENCY);
      const failed = results.filter((r) => r.status === "rejected");
      const succeeded = results.length - failed.length;

      if (failed.length === 0) {
        toast.success(`${selectedIds.length} course${selectedIds.length === 1 ? "" : "s"} updated`);
      } else if (succeeded === 0) {
        const first = failed[0] as PromiseRejectedResult;
        toast.error("Update failed", { description: (first.reason as Error)?.message });
      } else {
        toast.warning(`${succeeded} of ${results.length} update${results.length === 1 ? "" : "s"} succeeded`, {
          description: `${failed.length} failed — try again for the affected courses.`,
        });
      }

      setBulkUpdating(false);
      setSelectedIds([]);
      await load();
      onReload();
    } finally {
      setSaving(false);
    }
  };

  const approveAll = async (count: number) => {
    if (!(await confirm(
      `Approve all ${count} unapproved course${count === 1 ? "" : "s"}?`,
      "Every course in this extraction that isn't approved yet becomes approved and visible on public pages, search, the AI counsellor and the embed widget. Flagged courses stay flagged.",
      { confirmLabel: "Approve all", variant: "default" },
    ))) return;
    setSaving(true);
    try {
      const { updated } = await allExtractionsApi.approveAllCourses(jobId);
      toast.success(`${updated} course${updated === 1 ? "" : "s"} approved`);
      setSelectedIds([]);
      await load();
      onReload();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const bulkVerify = async (approve: boolean) => {
    setSaving(true);
    try {
      await allExtractionsApi.bulkVerifyCourses(selectedIds, approve);
      toast.success(`${selectedIds.length} course${selectedIds.length === 1 ? "" : "s"} ${approve ? "approved" : "flagged"}`);
      setSelectedIds([]);
      await load();
      onReload();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return { deleteCourse, bulkDelete, bulkUpdate, approveAll, bulkVerify };
}
