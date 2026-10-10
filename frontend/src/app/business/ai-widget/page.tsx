import { redirect } from "next/navigation";
import { WIDGET_SETTINGS_HREF } from "./const";

// Moved under the Inbox; kept so old links and bookmarks still land.
export default function AiWidgetPage() {
  redirect(WIDGET_SETTINGS_HREF);
}
