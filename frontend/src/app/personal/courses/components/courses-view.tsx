"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { fetchCourses } from "../store/courses-slice";
import { CourseCard, CourseCardSkeleton } from "./course-card";

export function CoursesView() {
  const dispatch = useAppDispatch();
  const { items, meta, status, error } = useAppSelector((s) => s.courses);

  // Ref guard per AGENTS.md — Strict Mode double-invokes effects on mount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchCourses(1));
  }, [dispatch]);

  const loadingFirstPage = status === "loading" && items.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Courses</h1>
        <p className="text-sm text-muted-foreground">
          {loadingFirstPage ? "Loading courses…" : `${meta.total} ${meta.total === 1 ? "course" : "courses"} found`}
        </p>
      </div>

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load courses"}</p>
          <Button variant="link" size="sm" className="px-0" onClick={() => dispatch(fetchCourses(meta.page))}>
            Try again
          </Button>
        </div>
      )}

      {loadingFirstPage && (
        <div className="space-y-3">
          <CourseCardSkeleton />
          <CourseCardSkeleton />
          <CourseCardSkeleton />
        </div>
      )}

      {!loadingFirstPage && status !== "failed" && items.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No courses available yet.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page <= 1 || status === "loading"}
            onClick={() => dispatch(fetchCourses(meta.page - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page >= meta.totalPages || status === "loading"}
            onClick={() => dispatch(fetchCourses(meta.page + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
