import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPriceMinor } from "../const";
import type { Plan } from "../apis/types";

export function PlanCard({
  plan,
  isCurrent,
  busy,
  onSubscribe,
}: {
  plan: Plan;
  isCurrent: boolean;
  busy: boolean;
  onSubscribe: () => void;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="text-base font-semibold">{plan.name}</h3>
        <p className="text-sm text-muted-foreground">{plan.description}</p>
      </div>

      <div>
        <span className="text-2xl font-semibold">{formatPriceMinor(plan.price_minor, plan.currency)}</span>
        <span className="text-sm text-muted-foreground"> / {plan.billing_interval}</span>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button className="mt-auto" disabled={isCurrent || busy} onClick={onSubscribe}>
        {isCurrent ? "Current plan" : busy ? "Redirecting…" : "Subscribe"}
      </Button>
    </Card>
  );
}
