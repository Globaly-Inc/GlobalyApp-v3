import { cookies } from "next/headers";
import { siteConfig } from "@/config/site";
import { parseThemeSettingsCookie, THEME_SETTINGS_KEY } from "@/lib/theme-settings";
import { ThemeSetupForm } from "./theme-setup-form";

export default async function ThemeSetupPage() {
  const cookieStore = await cookies();
  const initialSettings = parseThemeSettingsCookie(
    cookieStore.get(THEME_SETTINGS_KEY)?.value,
    siteConfig.name
  );

  return <ThemeSetupForm initialSettings={initialSettings} />;
}
