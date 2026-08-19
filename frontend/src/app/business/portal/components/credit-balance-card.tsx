"use client";

import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/app/portal/utils";

/** Below this, V1 flags the balance as low. Enquiry unlocks are what spend it. */
const LOW_BALANCE = 20;

/**
 * V1's credit card, measurement for measurement: p-5 content, a w-12 h-12 rounded-xl amber icon tile and a
 * text-2xl balance.
 *
 * V1 linked this to /business/credits. V3 has no such page yet, so it is a plain card rather than a link
 * to a 404 — it becomes a link the moment a credits page exists.
 */
export function CreditBalanceCard({ balance }: { balance: number | null }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <CreditCard className="h-6 w-6 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          {/* A dash, not a zero: the balance failing to load is not the same as having none. */}
          <p className="text-2xl font-bold">{balance === null ? "—" : formatNumber(balance)}</p>
          <p className="text-xs text-muted-foreground">Credit balance</p>
        </div>
        {balance !== null && balance < LOW_BALANCE && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
            Low
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
