"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreditUsageChart } from "./credit-usage-chart";
import { DailyLogTable } from "./daily-log-table";
import { ManualAdjustmentDialog } from "./manual-adjustment-dialog";

export function CreditsLedgerView() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Credit Ledger</h1>
          <p className="text-muted-foreground mt-1">All credit transactions across the platform</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Manual adjustment
        </Button>
      </div>

      <CreditUsageChart />
      <DailyLogTable />

      <ManualAdjustmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
