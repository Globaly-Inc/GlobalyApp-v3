"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useCompareTray } from "../use-compare-tray";
import type { CompareCourseItem } from "../types";

export function CourseCompareButton({ course }: Readonly<{ course: CompareCourseItem }>) {
  const { add, remove, has, isFull } = useCompareTray();
  const isComparing = has(course.id);
  const disabled = !isComparing && isFull;

  return (
    <label
      // The card is wrapped in a full-bleed overlay link, so the click has to be stopped here or
      // ticking the box would navigate to the course page instead.
      onClick={(e) => e.stopPropagation()}
      className={`flex shrink-0 items-center gap-2 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <Checkbox
        checked={isComparing}
        disabled={disabled}
        onCheckedChange={() => (isComparing ? remove(course.id) : add(course))}
      />
      <span className="text-foreground">Compare</span>
    </label>
  );
}
