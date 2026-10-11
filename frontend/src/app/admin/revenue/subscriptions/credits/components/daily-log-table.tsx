"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchDailyLog } from "../store/credits-ledger-slice";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function SkeletonRows() {
  return Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 7 }).map((__, j) => (
        <TableCell key={j} className={j > 1 && j < 6 ? "hidden md:table-cell" : undefined}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
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

  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            aria-label="Date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 bg-background pl-9"
          />
        </div>
        <SearchInput className="max-w-xs" placeholder="Search user..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="ml-auto px-2 text-sm text-muted-foreground">
          {!loading && `${dailyTotal} user${dailyTotal !== 1 ? "s" : ""} active on ${date}`}
        </span>
      </FilterBar>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Country</TableHead>
              <TableHead numeric className="hidden md:table-cell">Used</TableHead>
              <TableHead numeric className="hidden md:table-cell">Granted</TableHead>
              <TableHead numeric className="hidden md:table-cell">Net</TableHead>
              <TableHead numeric className="hidden md:table-cell">Txns</TableHead>
              <TableHead numeric>Balance EOD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <SkeletonRows />}
            {!loading && dailyEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No activity on {date}
                </TableCell>
              </TableRow>
            )}
            {!loading && dailyEntries.length > 0 && dailyEntries.map((entry) => (
              <TableRow key={entry.platform_user_id}>
                <TableCell primary>
                  {entry.owner_name}
                  <span className="block text-xs font-normal text-muted-foreground">{entry.owner_email}</span>
                  {/* Phones: the hidden money columns as one line. */}
                  <span className="block text-xs font-normal text-muted-foreground md:hidden">
                    {entry.total_used > 0 ? `-${entry.total_used} used · ` : ""}
                    {entry.total_granted > 0 ? `+${entry.total_granted} granted · ` : ""}
                    {signed(entry.net_change)} cr net · {entry.transaction_count} txns
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{entry.country_name ?? "—"}</TableCell>
                <TableCell numeric className="hidden font-medium text-destructive md:table-cell">
                  {entry.total_used > 0 ? `-${entry.total_used} cr` : "—"}
                </TableCell>
                <TableCell numeric className="hidden font-medium text-success md:table-cell">
                  {entry.total_granted > 0 ? `+${entry.total_granted} cr` : "—"}
                </TableCell>
                <TableCell numeric className={`hidden font-medium md:table-cell ${entry.net_change >= 0 ? "text-success" : "text-destructive"}`}>
                  {signed(entry.net_change)} cr
                </TableCell>
                <TableCell numeric className="hidden text-muted-foreground md:table-cell">{entry.transaction_count}</TableCell>
                <TableCell numeric className="text-muted-foreground">{entry.closing_balance} cr</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
