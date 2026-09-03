import type { Metadata } from "next";
import { ComingSoonView } from "./coming-soon/components/coming-soon-view";

export const metadata: Metadata = {
  title: "Globaly — Coming Soon",
  description:
    "Globaly's AI Education Discovery platform launches soon. Register your interest and we'll notify you the moment we go live.",
};

export default function RootPage() {
  return <ComingSoonView />;
}
