import { Bell } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function BusinessNotificationsPage() {
  return (
    <ComingSoon
      title="Notifications"
      icon={Bell}
      description="Everything that changed across your enquiries, listings and team, newest first."
      features={[
        "New enquiries and student replies",
        "Listing and moderation updates",
        "Team and branch activity",
        "Per-channel delivery preferences",
      ]}
      backHref="/business/portal"
      backLabel="Back to home"
    />
  );
}
