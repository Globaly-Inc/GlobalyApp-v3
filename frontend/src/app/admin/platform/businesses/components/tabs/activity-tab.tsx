"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchActivity } from "../../store/businesses-slice";
import { dayLabel } from "../../utils/activity-format";
import { ActivityRow } from "./activity-row";

const PAGE_SIZE = 10;

export function ActivityTab({ businessId, kind = "business" }: Readonly<{ businessId: number; kind?: "business" | "institution" }>) {
  const dispatch = useAppDispatch();
  const { items: activity, status, total } = useAppSelector((state) => state.platformBusinesses.activity);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    dispatch(fetchActivity({ id: businessId, params: { page: 1, limit: PAGE_SIZE }, kind }));
  }, [dispatch, businessId, kind]);

  const handlePageChange = (p: number) => {
    setPage(p);
    dispatch(fetchActivity({ id: businessId, params: { page: p, limit: PAGE_SIZE }, kind }));
  };

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (activity.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Activity className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No activity yet</p>
      </div>
    );
  } else {
    // Day headers between groups — the list is already newest first.
    body = (
      <div className="space-y-2">
        {activity.map((a, i) => {
          const day = dayLabel(a.created_at);
          const header = i === 0 || day !== dayLabel(activity[i - 1]!.created_at);
          return (
            <div key={a.id}>
              {header && <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground first:mt-0">{day}</p>}
              <ActivityRow entry={a} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Activity</span>
      </div>
      {body}
      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
    </div>
  );
}
