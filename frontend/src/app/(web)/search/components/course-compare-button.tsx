"use client";

import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "../use-compare-tray";
import type { CompareCourseItem } from "../types";

export function CourseCompareButton({ course }: Readonly<{ course: CompareCourseItem }>) {
  const { add, remove, has, isFull } = useCompareTray();
  const isComparing = has(course.id);

  return (
    <Button
      type="button"
      size="sm"
      variant={isComparing ? "default" : "outline"}
      disabled={!isComparing && isFull}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isComparing) remove(course.id); else add(course);
      }}
      className="h-7 px-2 text-xs gap-1 shrink-0"
    >
      <Layers className="h-3 w-3" />{isComparing ? "Added" : "Compare"}
    </Button>
  );
}
