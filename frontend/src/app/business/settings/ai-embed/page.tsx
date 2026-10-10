import { redirect } from "next/navigation";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";

// "AI embed" left Settings; the widget is reached from the Inbox now. Kept for old bookmarks.
export default function AiEmbedPage() {
  redirect(WIDGET_SETTINGS_HREF);
}
