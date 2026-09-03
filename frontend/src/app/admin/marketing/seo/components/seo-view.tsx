"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchDashboard, fetchSeoStatus } from "../store/seo-slice";
import { ActionPlan } from "./action-plan";
import { ReadinessChecklist } from "./readiness-checklist";
import { RankingsTable } from "./rankings-table";
import { SetupInstructions } from "./setup-instructions";
import { SuggestionsPanel } from "./suggestions-panel";

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
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">SEO / AEO</h1>
        <p className="mt-1 text-muted-foreground">
          Keyword rankings, suggested keywords, and AI-answer readiness for the blog.
        </p>
      </div>

      {statusStatus === "loading" && connected === null ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !connected ? (
        <SetupInstructions />
      ) : dashboardStatus === "loading" && rankings.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <RankingsTable rows={rankings} stale={stale} />
          </div>
          <SuggestionsPanel suggestions={suggestions} />
          <ReadinessChecklist readiness={readiness} />
          <div className="lg:col-span-2">
            <ActionPlan />
          </div>
        </div>
      )}
    </div>
  );
}
