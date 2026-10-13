"use client";

import { useEffect, useRef } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchDashboard, fetchSeoStatus } from "../store/seo-slice";
import { ActionPlan } from "./action-plan";
import { ReadinessChecklist } from "./readiness-checklist";
import { RankingsTable } from "./rankings-table";
import { SeoStats } from "./seo-stats";
import { SetupInstructions } from "./setup-instructions";
import { SuggestionsPanel } from "./suggestions-panel";

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

export function SeoView() {
  const dispatch = useAppDispatch();
  const { connected, statusStatus, dashboardStatus, rankings, stale, suggestions, readiness } =
    useAppSelector((state) => state.marketingSeo);

  // Guard against React Strict Mode's double-invoked effects double-firing the fetch on mount.
  const fetchedStatusRef = useRef(false);
  useEffect(() => {
    if (fetchedStatusRef.current) return;
    fetchedStatusRef.current = true;
    dispatch(fetchSeoStatus());
  }, [dispatch]);

  const fetchedDashboardRef = useRef(false);
  useEffect(() => {
    if (!connected || fetchedDashboardRef.current) return;
    fetchedDashboardRef.current = true;
    dispatch(fetchDashboard());
  }, [connected, dispatch]);

  return (
    <PageBody>
      <PageHeader
        title={<><TrendingUp /> SEO / AEO</>}
        subtitle="Keyword rankings, suggested keywords, and AI-answer readiness for the blog."
      />

      {statusStatus === "loading" && connected === null ? (
        <Spinner />
      ) : !connected ? (
        <SetupInstructions />
      ) : dashboardStatus === "loading" && rankings.length === 0 ? (
        <Spinner />
      ) : (
        <>
          <SeoStats rankings={rankings} readiness={readiness} />
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              <RankingsTable rows={rankings} stale={stale} />
              <ActionPlan />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <SuggestionsPanel suggestions={suggestions} />
              <ReadinessChecklist readiness={readiness} />
            </div>
          </div>
        </>
      )}
    </PageBody>
  );
}
