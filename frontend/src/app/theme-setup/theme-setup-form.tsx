"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { siteConfig } from "@/config/site";
import {
  applyThemeSettings,
  DEFAULT_PRIMARY,
  saveThemeSettings,
  type ThemeSettings,
} from "@/lib/theme-settings";
import { useThemeSettings } from "@/lib/use-theme-settings";

const FONTS = [
  { name: "Inter", value: "var(--font-inter)" },
  { name: "Fraunces", value: "var(--font-fraunces)" },
];

export function ThemeSetupForm({ initialSettings }: Readonly<{ initialSettings: ThemeSettings }>) {
  const settings = useThemeSettings(initialSettings);

  useEffect(() => {
    applyThemeSettings(settings);
  }, [settings]);

  function update<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) {
    saveThemeSettings({ ...settings, [key]: value });
  }

  function resetPrimary() {
    update("primaryColor", DEFAULT_PRIMARY);
  }

  function handleImageUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    key: "logoUrl" | "faviconUrl"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update(key, reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Theme setup</h1>
          <p className="text-sm text-muted-foreground">
            Saved to localStorage in your browser — wire up a settings API to
            persist these account-wide.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <section className="flex flex-col gap-2">
        <label htmlFor="primary-color" className="text-sm font-medium">
          Brand color
        </label>
        <div className="flex items-center gap-3">
          <input
            id="primary-color"
            type="color"
            value={settings.primaryColor}
            onChange={(e) => update("primaryColor", e.target.value)}
            className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent"
          />
          <span className="text-sm text-muted-foreground">{settings.primaryColor}</span>
          <Button variant="ghost" size="sm" onClick={resetPrimary}>
            Reset
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="font-family" className="text-sm font-medium">
          Font family
        </label>
        <select
          id="font-family"
          value={settings.font}
          onChange={(e) => update("font", e.target.value)}
          className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm"
        >
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.name}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="company-name" className="text-sm font-medium">
          Company name
        </label>
        <input
          id="company-name"
          value={settings.companyName}
          onChange={(e) => update("companyName", e.target.value)}
          className="h-9 w-72 rounded-md border border-input bg-background px-3 text-sm"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="company-logo" className="text-sm font-medium">
          Company logo
        </label>
        <input
          id="company-logo"
          type="file"
          accept="image/*"
          onChange={(e) => handleImageUpload(e, "logoUrl")}
          className="text-sm"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="favicon" className="text-sm font-medium">
          Favicon
        </label>
        <input
          id="favicon"
          type="file"
          accept="image/*"
          onChange={(e) => handleImageUpload(e, "faviconUrl")}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Optional — the tab icon uses this if set, otherwise falls back to
          the company logo.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="preview" className="text-sm font-medium">
          Preview
        </label>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
            <div className="flex items-center gap-1 rounded-t-md bg-background px-2 py-1 text-xs">
              {settings.faviconUrl || settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.faviconUrl || settings.logoUrl || undefined}
                  alt=""
                  className="size-3.5 rounded-sm object-cover"
                />
              ) : (
                <span
                  className="size-3.5 rounded-sm"
                  style={{ backgroundColor: settings.primaryColor }}
                />
              )}
              {settings.companyName || siteConfig.name}
            </div>
          </div>
          <div className="flex items-center justify-between bg-background px-6 py-3">
            <div className="flex items-center gap-2">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logoUrl} alt="" className="size-7 rounded-md object-cover" />
              ) : (
                <span
                  className="size-7 rounded-md"
                  style={{ backgroundColor: settings.primaryColor }}
                />
              )}
              <span
                className="font-semibold text-foreground"
                style={{ fontFamily: settings.font }}
              >
                {settings.companyName || siteConfig.name}
              </span>
            </div>
            <Button size="sm" style={{ backgroundColor: settings.primaryColor }}>
              Get started
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
