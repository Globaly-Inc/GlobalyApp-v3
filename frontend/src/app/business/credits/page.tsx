import { Coins } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function BusinessCreditsPage() {
  return (
    <ComingSoon
      title="Credits"
      icon={Coins}
      description="Credits cover promotions, AI drafting and premium placements. Balance and top-ups land here."
      features={[
        "Balance and usage breakdown",
        "Top up or set auto-recharge",
        "Spend by campaign and team member",
        "Invoices and receipts",
      ]}
      backHref="/business/portal"
      backLabel="Back to home"
    />
  );
}
