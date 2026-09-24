import { Suspense } from "react";
import type { Metadata } from "next";
import { ComparePageView } from "./compare-page-view";

export const metadata: Metadata = {
  title: "Compare Courses — Globaly",
};

export default function ComparePage() {
  return (
    <Suspense>
      <ComparePageView />
    </Suspense>
  );
}
