"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchDailyLog } from "../store/credits-ledger-slice";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function SkeletonRows() {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="border-b">
      {Array.from({ length: 7 }).map((__, j) => (
        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
      ))}
    </tr>
  ));
}

export function DailyLogTable() {
  const dispatch = useAppDispatch();
  const { dailyEntries, dailyTotal, dailyStatus } = useAppSelector((s) => s.creditsLedger);
  const [date, setDate] = useState(today());
  const [search, setSearch] = useState("");

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchDailyLog({ date }));
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMount = useRef(true);
  useEffect(() => {
    if (isMount.current) { isMount.current = false; return; }
    dispatch(fetchDailyLog({ date, search: search || undefined }));
  }, [dispatch, date, search]);

  const loading = dailyStatus === "loading";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 pl-9 pr-3 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Input
          className="max-w-xs"
          placeholder="Search user..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-sm text-muted-foreground ml-auto">
          {!loading && `${dailyTotal} user${dailyTotal !== 1 ? "s" : ""} active on ${date}`}
        </span>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Country</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Used</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Granted</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Net</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Txns</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Balance EOD</th>
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows />}
            {!loading && dailyEntries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No activity on {date}
                </td>
              </tr>
            )}
            {!loading && dailyEntries.length > 0 && dailyEntries.map((entry) => (
                <tr key={entry.platform_user_id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{entry.owner_name}</p>
                    <p className="text-xs text-muted-foreground">{entry.owner_email}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">
                    {entry.country_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-destructive">
                    {entry.total_used > 0 ? `-${entry.total_used} cr` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">
                    {entry.total_granted > 0 ? `+${entry.total_granted} cr` : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${entry.net_change >= 0 ? "text-green-600" : "text-destructive"}`}>
                    {entry.net_change >= 0 ? `+${entry.net_change}` : entry.net_change} cr
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {entry.transaction_count}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {entry.closing_balance} cr
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
