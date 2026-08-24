import { Coins, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SubscriptionStatus } from "../apis/types";

export function SubscriptionSummary({
  subscription,
  openingPortal,
  onManageBilling,
}: {
  subscription: SubscriptionStatus | null;
  openingPortal: boolean;
  onManageBilling: () => void;
}) {
  if (!subscription) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Current plan</p>
          <p className="text-sm font-semibold">{subscription.plan_name ?? "No active plan"}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Coins className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{subscription.credit_balance}</span>
          <span className="text-muted-foreground">credits</span>
        </div>
      </div>

      {subscription.has_customer && (
        <Button variant="outline" size="sm" disabled={openingPortal} onClick={onManageBilling}>
          <CreditCard className="mr-2 h-4 w-4" />
          {openingPortal ? "Opening…" : "Manage billing"}
        </Button>
      )}
    </div>
  );
}
