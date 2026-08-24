import { Bell } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function NotificationsPage() {
  return (
    <ComingSoon
      title="Notifications"
      icon={Bell}
      description="Every update on your applications, enquiries and earnings, in the order it happened."
      features={[
        "Application and enquiry status changes",
        "Replies from institutions and agents",
        "Payout and credit activity",
        "Per-channel notification preferences",
      ]}
    />
  );
}
