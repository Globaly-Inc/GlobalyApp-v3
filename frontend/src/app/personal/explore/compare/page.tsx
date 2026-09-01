import type { Metadata } from "next";
import { ComparePageView } from "@/app/(web)/compare/compare-page-view";

export const metadata: Metadata = { title: "Compare Courses — Globaly" };

/**
 * Same compare view as the public /compare page, mounted here (nested under /personal/explore) so
 * it renders inside PersonalShell — sidebar, header — instead of dropping the user out of the
 * portal, and so the "Explore" nav item stays highlighted while comparing (portal-sidebar.tsx
 * matches active state by path prefix).
 */
export default function PersonalComparePage() {
  return <ComparePageView basePath="/personal/explore/compare" exploreHref="/personal/explore?tab=courses" />;
}
