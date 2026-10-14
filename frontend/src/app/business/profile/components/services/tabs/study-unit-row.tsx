"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { UnitCodeChip } from "../unit-code-chip";
import { UnitCredits } from "../unit-credits";
import { HighlightMatch } from "./highlight-match";
import type { ServiceStudyUnit } from "../../../apis/types";

/** One study unit: code chip, name, credits on the right, then edit + confirm-delete (dimmed until
 * the row is hovered or focused). `query` highlights the search match in the code and name. */
export function StudyUnitRow({
  unit,
  query,
  onEdit,
  onDelete,
}: Readonly<{ unit: ServiceStudyUnit; query: string; onEdit: () => void; onDelete: () => Promise<void> }>) {
  return (
    <div className="group/row flex items-center gap-3 rounded-xl border bg-card p-3 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-px hover:border-primary/20 hover:shadow-md">
      {unit.unit_code && (
        <UnitCodeChip elective={unit.unit_type === "elective"} className="min-w-[84px]">
          <HighlightMatch text={unit.unit_code} query={query} />
        </UnitCodeChip>
      )}
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
        <HighlightMatch text={unit.unit_name} query={query} />
      </p>
      <UnitCredits value={unit.credit_points} />
      <div className="flex items-center gap-0.5 opacity-55 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
        <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Edit study unit" className="active:scale-90">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <ConfirmDeleteButton onConfirm={onDelete} label="Delete" question="Delete unit?" />
      </div>
    </div>
  );
}
