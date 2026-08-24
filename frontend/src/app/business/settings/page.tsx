import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function BusinessSettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      icon={Settings}
      description="Account, billing and team controls for your business — moving here from the profile page."
      features={[
        "Roles and team permissions",
        "Billing details and invoices",
        "Notification preferences",
        "Integrations and API access",
      ]}
      backHref="/business/portal"
      backLabel="Back to home"
    />
  );
}
