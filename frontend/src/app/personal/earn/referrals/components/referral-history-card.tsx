import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import type { ReferralRow } from "../apis/types";
import { ACTION_META } from "../const";

export function ReferralHistoryCard({ referrals }: Readonly<{ referrals: ReferralRow[] }>) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Referral history</CardTitle>
      </CardHeader>
      {referrals.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead numeric>Credits</TableHead>
              <TableHead numeric>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.map((r) => {
              const meta = r.action_type ? ACTION_META[r.action_type] : null;
              const Icon = meta?.icon;
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{new Date(r.date).toLocaleDateString("en-AU")}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {meta?.label ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell numeric className="font-semibold text-success">
                    +{formatNumber(r.credits_awarded ?? 0)}
                  </TableCell>
                  <TableCell numeric>
                    <Badge variant="success">Credited</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <CardContent>
          <EmptyState compact icon={UserPlus} title="No referrals yet. Share your link to start earning!" />
        </CardContent>
      )}
    </Card>
  );
}
