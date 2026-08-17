import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { MarketplaceView } from "./components/marketplace-view";

export const metadata: Metadata = {
  title: "Student services — Globaly",
  description:
    "Airport pickups, tutoring, accommodation help and more, offered by students who have already done it.",
};

export default function ServicesPage() {
  // The view reads ?search= to seed the query arriving from the hero switcher, and useSearchParams needs a
  // Suspense boundary during prerender.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <MarketplaceView />
    </Suspense>
  );
}
