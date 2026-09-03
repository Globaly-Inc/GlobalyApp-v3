import { Megaphone } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function MarketingPage() {
  return (
    <ComingSoon
      title="Marketing"
      icon={Megaphone}
      description="Run campaigns, promote your services and see what's actually bringing students in."
      features={[
        "Create and schedule campaigns",
        "Promote listings on Globaly search",
        "Track reach, clicks and enquiries",
        "Manage budget and spend in one view",
      ]}
      backHref="/business/portal"
      backLabel="Back to home"
    />
  );
}
