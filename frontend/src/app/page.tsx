import { redirect } from "next/navigation";

// The launch countdown is parked, not deleted — src/app/coming-soon/ stays as it is. To bring it
// back, drop the redirect below and restore these two:
//
// import type { Metadata } from "next";
// import { ComingSoonView } from "./coming-soon/components/coming-soon-view";
//
// export const metadata: Metadata = {
//   title: "Globaly — Coming Soon",
//   description:
//     "Globaly's AI Education Discovery platform launches soon. Register your interest and we'll notify you the moment we go live.",
// };

/** `/` and `/home` are the same page: the marketing home in the (web) group, which owns its own
 *  navbar, footer and metadata — hence a redirect rather than rendering the view here. */
export default function RootPage() {
  redirect("/home");
}
