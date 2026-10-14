"use client";

import { CheckCircle2, ExternalLink, Flag, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { allExtractionsApi } from "../apis";
import { RowActors } from "./row-actors";
import { humanize } from "./course-detail-shared";
import type { CourseFull } from "../apis/types";

export function CourseDetailHeader({ course, busy, run, onClose }: Readonly<{
  course: CourseFull;
  busy: boolean;
  run: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
  onClose: () => void;
}>) {

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="font-semibold break-words">{course.name}</h3>
        {course.source_url && (
          <a
            href={course.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Source
          </a>
        )}
        <RowActors row={course} className="mt-1" />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {course.verification_status && course.verification_status !== "unverified" && (
          <Badge variant="outline" className="text-xs capitalize">{humanize(course.verification_status)}</Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs cursor-pointer"
          disabled={busy || course.verification_status === "confirmed"}
          onClick={() => run(() => allExtractionsApi.approveCourse(course.id), "Course approved")}
        >
          <CheckCircle2 className="h-3 w-3 text-success" />
          Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs text-destructive cursor-pointer"
          disabled={busy || course.verification_status === "flagged"}
          onClick={() => run(() => allExtractionsApi.rejectCourse(course.id), "Course flagged")}
        >
          <Flag className="h-3 w-3" />
          Flag
        </Button>
        <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
