import { Users } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

// A tab, not a feature. Ambassador is Epic 5's second feature and is not built — this exists so the Earn
// sub-nav shows the module's real shape instead of a single lonely tab.
export default function AmbassadorsPage() {
  return (
    <ComingSoon
      title="Ambassadors"
      icon={Users}
      description="Represent Globaly on your campus and earn for every student you bring on board."
      features={[
        "Apply to an ambassador program",
        "Track sign-ups from your campus",
        "See commission as it's earned",
        "Access ready-made campaign material",
      ]}
      backHref="/personal/earn/services"
      backLabel="Back to Earn"
    />
  );
}
