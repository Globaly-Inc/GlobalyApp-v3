"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { VERTICAL_STATUS_TABS } from "../const";
import {
  fetchVerticalRows,
  fetchVerticals,
  setActiveSlug,
  setStatusFilter,
} from "../store/service-verticals-slice";
import type { VerticalReviewStatus, VerticalSlug } from "../apis/types";
import { VerticalRowCard } from "./vertical-row-card";

export function ServiceVerticalsView() {
  const dispatch = useAppDispatch();
  const { verticals, activeSlug, rows, status, statusFilter, error } = useAppSelector(
    (s) => s.dataServiceVerticals,
  );

  useEffect(() => {
    dispatch(fetchVerticals());
  }, [dispatch]);

  useEffect(() => {
    dispatch(
      fetchVerticalRows({
        slug: activeSlug,
        status: statusFilter === "all" ? undefined : (statusFilter as VerticalReviewStatus),
      }),
    );
  }, [dispatch, activeSlug, statusFilter]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Service Verticals</h1>
        <p className="text-muted-foreground mt-1">
          Accommodation, insurance, banking, visa services, test prep, career services, translation
          and transport, staged by the extraction pipeline and reviewed before they reach the live
          catalog.
        </p>
      </div>

      {/* Vertical tabs */}
      <div className="flex gap-1 flex-wrap mb-3">
        {verticals.map((vertical) => (
          <Button
            key={vertical.slug}
            variant={activeSlug === vertical.slug ? "default" : "outline"}
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={() => dispatch(setActiveSlug(vertical.slug as VerticalSlug))}
          >
            {vertical.label}
            {vertical.counts.pending > 0 && (
              <Badge variant="secondary">{vertical.counts.pending}</Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Review-status tabs */}
      <div className="flex gap-1 flex-wrap mb-4">
        {VERTICAL_STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={statusFilter === tab.value ? "default" : "outline"}
            size="sm"
            className="cursor-pointer"
            onClick={() => dispatch(setStatusFilter(tab.value))}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : status === "failed" ? (
        <p className="text-sm text-destructive py-12 text-center">
          {error ?? "Failed to load staged rows."}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          Nothing staged in this view. Service extraction jobs stage here once a job is created with
          this vertical&apos;s service category.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <VerticalRowCard key={row.id} row={row} slug={activeSlug} />
          ))}
        </div>
      )}
    </div>
  );
}
