// The feature itself lives at /business/ai-widget (the portal's "AI assistant" tile links
// there). This settings route is the sidebar's entry point for the same page.
import { AiWidgetView } from "@/app/business/ai-widget/components/ai-widget-view";

export default function AiEmbedPage() {
  return <AiWidgetView />;
}
