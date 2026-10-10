import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AiWidgetView } from "@/app/business/ai-widget/components/ai-widget-view";

/** The AI widget's settings, under the Inbox so the Inbox stays highlighted in the menu. */
export default function WidgetSettingsPage() {
  return (
    // /business/messages is full-bleed in the shell, so this page brings its own gutter. The left
    // one leaves the width of PortalSidebar's 180px sub-panel empty, so it lines up with the
    // pages that have one (Contacts › Visitors). From xl the page is exactly one screen tall
    // (the shell header is 4rem) and the editor fits inside it — Create/Save never fall below the fold.
    <div className="flex flex-col gap-3 px-4 py-5 sm:px-6 md:pl-[calc(180px+1.5rem)] xl:h-[calc(100dvh-4rem)]">
      <Link href="/business/messages" className="flex w-fit items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="size-3.5" aria-hidden />
        Inbox
      </Link>
      <AiWidgetView />
    </div>
  );
}
