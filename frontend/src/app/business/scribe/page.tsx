import { PenLine } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function ScribePage() {
  return (
    <ComingSoon
      title="Scribe"
      icon={PenLine}
      description="AI drafting for the writing your team repeats every day — offers, replies and student documents."
      features={[
        "Draft replies from an enquiry's context",
        "Generate offer and acceptance letters",
        "Reusable templates for your team",
        "Review and edit before anything sends",
      ]}
      backHref="/business/portal"
      backLabel="Back to home"
    />
  );
}
