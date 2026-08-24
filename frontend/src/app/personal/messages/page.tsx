import { MessageSquare } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function MessagesPage() {
  return (
    <ComingSoon
      title="Messages"
      icon={MessageSquare}
      description="Talk to institutions, agents and service providers without leaving Globaly."
      features={[
        "One inbox for every conversation",
        "Share documents securely",
        "Message history tied to each enquiry",
        "Email and in-app notifications",
      ]}
    />
  );
}
