import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AiWidgetView } from "@/app/business/ai-widget/components/ai-widget-view";

/** The AI widget's settings, under the Inbox so the Inbox stays highlighted in the menu. */
export default function WidgetSettingsPage() {
  return (
    // /business/messages is full-bleed in the shell, so this page brings its own gutter.
    <div className="flex flex-col gap-4 px-4 py-8 sm:px-6">
      <Link href="/business/messages" className="mx-auto flex w-full max-w-6xl items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="size-3.5" aria-hidden />
        Inbox
      </Link>
      <AiWidgetView />
    </div>
  );
}
