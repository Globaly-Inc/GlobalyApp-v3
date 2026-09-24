"use client";

import { useSearchParams } from "next/navigation";

// Wraps an owner's unpublished-page preview (see the self-service "Preview" button, which opens
// a course/institution page with `preview_token`) so the WHOLE shell reads as a look-but-don't-
// touch snapshot — nav bar, page content and footer all become inert, since a public visitor
// could never reach this page at all and nothing here should behave as if they had. Used once in
// the (web) layout so it covers the Navbar/Footer too, not just the page's own content (those
// live outside `children` there, so a per-page wrapper alone can't reach them). A client
// component (needs the query string), kept separate from layout.tsx so that one can stay a server
// component and keep its `metadata` export.
export function PreviewLock({ children }: Readonly<{ children: React.ReactNode }>) {
  const previewing = !!useSearchParams().get("preview_token");
  if (!previewing) return children;
  return (
    <div className="relative">
      <div className="border-b border-primary/30 bg-primary/5 px-4 py-2.5 text-center text-sm text-primary">
        Preview only — this page isn&apos;t visible to the public until published.
      </div>
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  );
}
