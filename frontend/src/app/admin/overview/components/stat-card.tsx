import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatValue } from "../utils";
import type { StatCardConfig } from "../types";

export function StatCard({
  config,
  value,
  loading,
}: Readonly<{ config: StatCardConfig; value: number | null | undefined; loading: boolean }>) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{config.label}</CardTitle>
        <config.icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold text-foreground">{formatStatValue(value)}</p>
        )}
      </CardContent>
    </Card>
  );
}
