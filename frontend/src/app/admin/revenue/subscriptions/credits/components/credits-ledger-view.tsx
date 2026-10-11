"use client";

import { useState } from "react";
import { Coins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { CreditUsageChart } from "./credit-usage-chart";
import { DailyLogTable } from "./daily-log-table";
import { ManualAdjustmentDialog } from "./manual-adjustment-dialog";

export function CreditsLedgerView() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <PageBody>
      <PageHeader title={<><Coins /> Credit Ledger</>} subtitle="All credit transactions across the platform">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus />
          Manual adjustment
        </Button>
      </PageHeader>

      <CreditUsageChart />
      <DailyLogTable />

      <ManualAdjustmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageBody>
  );
}
