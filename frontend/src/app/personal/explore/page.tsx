import { Compass } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function ExplorePage() {
  return (
    <ComingSoon
      title="Explore"
      icon={Compass}
      description="A single place to browse courses, institutions and destinations — tuned to what you're actually looking for."
      features={[
        "Search courses across every partner institution",
        "Filter by country, intake and budget",
        "Save shortlists and compare side by side",
        "Jump straight into an enquiry",
      ]}
    />
  );
}
