"use client";

import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CourseAssignment, CourseFull, CourseLinks, JunctionSlug } from "../apis/types";

/** What every course-detail section needs from CourseDetailPanel. */
export type CourseSectionProps = Readonly<{
  course: CourseFull;
  links: CourseLinks;
  jobId: string;
  busy: boolean;
  run: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
  createAndLink: (junction: JunctionSlug, create: () => Promise<{ id: string }>, success: string) => Promise<boolean>;
  link: (junction: JunctionSlug, entityId: string) => Promise<boolean>;
  unlink: (junction: JunctionSlug, entityId: string) => Promise<boolean>;
  sharedWith: (rows: CourseAssignment[], column: string, entityId: string) => string[];
}>;

export const humanize = (v: string | null | undefined) => (v ? v.replaceAll("_", " ") : "");

export const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "");

export const addButton = (busy: boolean, onClick: () => void, label: string) => (
  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs cursor-pointer" disabled={busy} onClick={onClick}>
    <Plus className="h-3 w-3" />
    {label}
  </Button>
);

export const rowActions = (busy: boolean, onEdit: () => void, onUnlinkClick: () => void) => (
  <>
    <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Edit" disabled={busy} onClick={onEdit}>
      <Pencil className="h-3 w-3" />
    </Button>
    <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Unlink" disabled={busy} onClick={onUnlinkClick}>
      <X className="h-3 w-3" />
    </Button>
  </>
);
