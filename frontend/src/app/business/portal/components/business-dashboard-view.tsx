"use client";

import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessDashboard } from "../store/business-dashboard-slice";
import { DashboardHero } from "./dashboard-hero";
import { DashboardStats } from "./dashboard-stats";
import { QuickActions } from "./quick-actions";
import { RecentEnquiries } from "./recent-enquiries";

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

export function BusinessDashboardView() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((s) => s.businessDashboard);

  // Ref guard per AGENTS.md — Strict Mode double-invokes effects on mount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchBusinessDashboard());
  }, [dispatch]);

  // Fail closed: no partial screen, no zeroes standing in for numbers the server
  // declined to give. The server's own message is what the user reads.
  if (status === "failed") {
    return (
      <div className="rounded-xl border border-border bg-background p-8 text-center">
        <p className="text-sm font-medium">We could not load your dashboard</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => dispatch(fetchBusinessDashboard())}
          className="mt-4 text-sm font-medium text-primary underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  return (
    <div className="space-y-4">
      <DashboardHero business={data.business} member={data.member} />
      <DashboardStats data={data} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentEnquiries leads={data.enquiries.recent} total={data.enquiries.total} />
        </div>
        <QuickActions />
      </div>
    </div>
  );
}
