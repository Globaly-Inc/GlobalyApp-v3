import { GraduationCap } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function LmsPage() {
  return (
    <ComingSoon
      title="LMS"
      icon={GraduationCap}
      description="Publish your courses, enrol students and follow their progress without a second platform."
      features={[
        "Build courses, modules and lessons",
        "Enrol and manage student cohorts",
        "Track completion and assessments",
        "Issue certificates automatically",
      ]}
      backHref="/business/portal"
      backLabel="Back to home"
    />
  );
}
