"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchActivity } from "../../store/businesses-slice";

const PAGE_SIZE = 10;

function formatAction(action: string): string {
  return action.replaceAll("BUSINESS_", "").replaceAll("_", " ").toLowerCase();
}

export function ActivityTab({ businessId }: Readonly<{ businessId: number }>) {
  const dispatch = useAppDispatch();
  const { items: activity, status, total } = useAppSelector((state) => state.platformBusinesses.activity);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    dispatch(fetchActivity({ id: businessId, params: { page: 1, limit: PAGE_SIZE } }));
  }, [dispatch, businessId]);

  const handlePageChange = (p: number) => {
    setPage(p);
    dispatch(fetchActivity({ id: businessId, params: { page: p, limit: PAGE_SIZE } }));
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
    body = (
      <div className="space-y-2">
        {activity.map((a) => {
          const admin = `${a.admin_first_name ?? ""} ${a.admin_last_name ?? ""}`.trim() || "Admin";
          return (
            <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm capitalize">{formatAction(a.action)}</p>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{admin}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
              </div>
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
