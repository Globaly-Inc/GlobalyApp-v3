"use client";

import { useState } from "react";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { servicesApi } from "../apis";
import type { Order } from "../apis";

/**
 * The provider moving a paid order forward: started, then done.
 *
 * Provider-only and deliberately one-sided. This is the provider's account of the work, not an agreement —
 * the buyer's recourse if they disagree is Report a problem, which is the same escape hatch that existed
 * before. Said plainly in the copy rather than implied, because "Completed" on a screen the buyer also reads
 * would otherwise look like something they had agreed to.
 *
 * Marking complete is allowed straight from `paid`: a short job may never be marked in progress, and making
 * someone click twice to record one airport run would only train them to click twice.
 */
export function SellerWorkActions({
  order,
  onOrderChange,
}: Readonly<{ order: Order; onOrderChange: (order: Order) => void }>) {
  const [acting, setActing] = useState(false);

  const run = async (fn: () => Promise<Order>, success: string, failure: string) => {
    setActing(true);
    try {
      onOrderChange(await fn());
      toast.success(success);
    } catch (err) {
      toast.error(failure, { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setActing(false);
    }
  };

  const started = order.status === "in_progress";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-5">
        <div>
          <p className="text-sm font-medium text-foreground">
            {started ? "This job is in progress" : "Ready to start?"}
          </p>
          <p className="text-xs text-muted-foreground">
            {started
              ? "Mark it complete once you've finished. The buyer can see this status."
              : "Let the buyer know you've started. You can also mark it complete directly."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!started && (
            <Button
              variant="outline"
              onClick={() => run(() => servicesApi.startWork(order.id), "Marked as in progress", "Couldn't update")}
              disabled={acting}
            >
              <PlayCircle data-icon="inline-start" />
              Mark as in progress
            </Button>
          )}
          <Button
            onClick={() => run(() => servicesApi.finishWork(order.id), "Marked as completed", "Couldn't update")}
            disabled={acting}
          >
            <CheckCircle2 data-icon="inline-start" />
            {acting ? "Updating…" : "Mark as completed"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
