import { GraduationCap } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function LearningPage() {
  return (
    <ComingSoon
      title="Learning"
      icon={GraduationCap}
      description="Your enrolled courses, progress and certificates — all tracked in one place."
      features={[
        "Continue where you left off",
        "Track lesson and module progress",
        "Download completion certificates",
        "Get reminders before deadlines",
      ]}
    />
  );
}
