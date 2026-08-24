"use client";

import { CreditCard, Inbox, Package, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

type BusinessStatsSidebarProps = {
  enquiriesCount: number;
  servicesCount: number;
  creditBalance: number;
};

const STAT_TINTS = {
  blue: "text-blue-600 bg-blue-500/10 ring-blue-500/15 dark:text-blue-400",
  emerald: "text-emerald-600 bg-emerald-500/10 ring-emerald-500/15 dark:text-emerald-400",
  amber: "text-amber-600 bg-amber-500/10 ring-amber-500/15 dark:text-amber-400",
  violet: "text-violet-600 bg-violet-500/10 ring-violet-500/15 dark:text-violet-400",
};

export function BusinessStatsSidebar({ enquiriesCount, servicesCount, creditBalance }: BusinessStatsSidebarProps) {
  const stats = [
    { icon: Inbox, label: "Enquiries", value: enquiriesCount, tint: STAT_TINTS.blue },
    { icon: Package, label: "Services", value: servicesCount, tint: STAT_TINTS.emerald },
    { icon: CreditCard, label: "Credits", value: creditBalance, tint: STAT_TINTS.amber },
    { icon: TrendingUp, label: "Views", value: 0, tint: STAT_TINTS.violet },
  ];

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden border-amber-200/60 bg-gradient-to-br from-amber-50 to-transparent dark:border-amber-500/20 dark:from-amber-500/10">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
            <CreditCard className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tabular-nums text-foreground">{formatNumber(creditBalance)}</p>
            <p className="text-xs font-medium text-muted-foreground">Credit balance</p>
          </div>
          {creditBalance < 20 && (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-300 bg-amber-100 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400"
            >
              Low
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="p-4">
              <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-xl ring-1", s.tint)}>
                <s.icon className="h-4 w-4" />
              </div>
              <p className="text-xl font-bold tabular-nums text-foreground">{formatNumber(s.value)}</p>
              <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
