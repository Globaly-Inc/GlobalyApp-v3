"use client";

// Admin → Revenue → Credit ledger. Replaces the placeholder that rendered two hard-coded rows.
//
// Referral credits appear here without any referral-specific code: rewards are ordinary
// credit_transactions rows, and this ledger is the single place credits are recorded regardless of what
// wrote them. That is also why "Balance after" comes from a SQL window function — the table is
// append-only and stores no balance, so accumulating it in the client would be wrong the moment a page
// boundary is crossed.

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn, formatNumber } from "@/lib/utils";
import { fetchCredits } from "../store/credit-ledger-slice";
import { KIND_FILTERS, KIND_LABELS } from "../const";
import type { CreditKind } from "../apis/types";

const COLUMN_CLASSES = "grid-cols-[7rem_minmax(0,1fr)_9rem_6rem_7rem]";

export function CreditLedgerView() {
  const dispatch = useAppDispatch();
  const { rows, meta, status, error } = useAppSelector((s) => s.adminCreditLedger);
  const [kind, setKind] = useState("all");

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchCredits({}));
  }, [dispatch]);

  const load = (page: number, nextKind = kind) =>
    dispatch(
      fetchCredits({ page, ...(nextKind !== "all" ? { kind: nextKind as CreditKind } : {}) }),
    );

  // base-ui's Select can emit null when cleared, so normalise before it reaches the query.
  const onKindChange = (value: string | null) => {
    const next = value ?? "all";
    setKind(next);
    load(1, next); // a filter change resets to page 1, or the view can land past the last page
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Credit Ledger</h1>
        <p className="mt-1 text-muted-foreground">
          Every credit movement, including referral rewards. Append-only — a reversal is a new negative
          row, never an edit.
        </p>
      </div>

      <div className="mb-4">
        <Select value={kind} onValueChange={onKindChange}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {KIND_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {formatNumber(meta.total)} {meta.total === 1 ? "record" : "records"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className={cn(
              "grid gap-3 border-b border-border px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
              COLUMN_CLASSES,
            )}
          >
            <span>Date</span>
            <span>Account</span>
            <span className="hidden sm:block">Type</span>
            <span className="text-right">Amount</span>
            <span className="hidden text-right sm:block">Balance after</span>
          </div>

          {status === "loading" && rows.length === 0 ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : status === "failed" ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{error}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No credit transactions found
            </p>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((r) => {
                const isCredit = r.amount > 0;
                return (
                  <div
                    key={r.id}
                    className={cn("grid items-center gap-3 px-4 py-3 text-sm", COLUMN_CLASSES)}
                  >
                    <span className="text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("en-AU")}
                    </span>

                    <span className="min-w-0">
                      {/* A deleted account still has ledger rows (history outlives the account), so fall
                          back to the id rather than dropping the row or rendering an empty cell. */}
                      <span className="block truncate font-medium text-foreground">
                        {r.owner_name ?? `#${r.owner_id}`}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.owner_type === "business" ? "Business" : "Personal"}
                        {r.description ? ` · ${r.description}` : ""}
                      </span>
                    </span>

                    <span className="hidden sm:block">
                      <Badge variant="outline">{KIND_LABELS[r.kind] ?? r.kind}</Badge>
                    </span>

                    <span
                      className={cn(
                        "text-right font-semibold",
                        isCredit ? "text-emerald-600" : "text-destructive",
                      )}
                    >
                      {isCredit ? "+" : "−"}
                      {formatNumber(Math.abs(r.amount))}
                    </span>

                    <span className="hidden text-right text-muted-foreground sm:block">
                      {formatNumber(r.balance_after)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {meta.total > meta.limit && (
        <Pagination
          page={meta.page}
          total={meta.total}
          limit={meta.limit}
          onPageChange={(page) => load(page)}
        />
      )}
    </div>
  );
}
