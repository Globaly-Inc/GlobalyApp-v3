import { MessageSquare } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function BusinessMessagesPage() {
  return (
    <ComingSoon
      title="Messages"
      icon={MessageSquare}
      description="One shared inbox for the students, agents and partners your team talks to."
      features={[
        "Shared team inbox with assignment",
        "Threads linked to each enquiry",
        "Secure document exchange",
        "Full conversation history",
      ]}
      backHref="/business/portal"
      backLabel="Back to home"
    />
  );
}
