"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { LedgerEntry } from "../apis/types";
import { REASON_LABELS } from "../const";

function AmountCell({ amount }: { amount: number }) {
  const positive = amount > 0;
  return (
    <span className={positive ? "text-green-600 font-medium" : "text-destructive font-medium"}>
      {positive ? `+${amount}` : amount} cr
    </span>
  );
}

function OwnerCell({ name, email }: { name: string; email: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{name}</p>
      <p className="text-xs text-muted-foreground/70">{email}</p>
    </div>
  );
}

function SkeletonRows() {
  return Array.from({ length: 8 }).map((_, i) => (
    <tr key={i} className="border-b">
      {Array.from({ length: 6 }).map((__, j) => (
        <td key={j} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  ));
}

export function LedgerTable({
  entries,
  loading,
}: Readonly<{ entries: LedgerEntry[]; loading: boolean }>) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Owner</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Balance after</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows />
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                No transactions found
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <tr key={entry.id} className="border-b hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString("en-GB", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3">
                  <OwnerCell name={entry.owner_name} email={entry.owner_email} />
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{REASON_LABELS[entry.reason]}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                  {entry.description ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <AmountCell amount={entry.amount} />
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {entry.balance_after} cr
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
