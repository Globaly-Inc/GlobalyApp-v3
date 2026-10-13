"use client";

import { useEffect } from "react";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
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
  { label: "Geist", value: "var(--font-geist)" },
  { label: "Space Grotesk", value: "var(--font-space-grotesk)" },
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
    // Standalone page outside the portal shell, so it owns its own gutter and width.
    <PageBody className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-16">
      <PageHeader
        title="Theme setup"
        subtitle="Saved to localStorage in your browser — wire up a settings API to persist these account-wide."
      >
        <ThemeToggle />
      </PageHeader>

      <FormSection title="Brand">
        <FormField label="Brand color" htmlFor="primary-color" wide>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="primary-color"
              type="color"
              value={settings.primaryColor}
              onChange={(e) => update("primaryColor", e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-input bg-transparent"
            />
            <span className="font-mono text-sm text-muted-foreground">{settings.primaryColor}</span>
            <Button variant="ghost" size="sm" onClick={resetPrimary}>
              Reset
            </Button>
          </div>
        </FormField>
        <FormField label="Font family" htmlFor="font-family">
          <Combobox id="font-family" options={FONTS} value={FONTS.some((f) => f.value === settings.font) ? settings.font : (FONTS[0]?.value ?? settings.font)} onChange={(value) => update("font", value)} />
        </FormField>
        <FormField label="Company name" htmlFor="company-name">
          <Input id="company-name" value={settings.companyName} onChange={(e) => update("companyName", e.target.value)} />
        </FormField>
      </FormSection>

      <FormSection title="Logo & favicon">
        <FormField label="Company logo" htmlFor="company-logo">
          <Input id="company-logo" type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "logoUrl")} />
        </FormField>
        <FormField
          label="Favicon"
          htmlFor="favicon"
          hint="Optional — the tab icon uses this if set, otherwise falls back to the company logo."
        >
          <Input id="favicon" type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "faviconUrl")} />
        </FormField>
      </FormSection>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemePreview settings={settings} />
        </CardContent>
      </Card>
    </PageBody>
  );
}

function ThemePreview({ settings }: Readonly<{ settings: ThemeSettings }>) {
  const name = settings.companyName || siteConfig.name;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
        <div className="flex min-w-0 items-center gap-1 rounded-t-md bg-background px-2 py-1 text-xs">
          {settings.faviconUrl || settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.faviconUrl || settings.logoUrl || undefined}
              alt=""
              className="size-3.5 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <span className="size-3.5 shrink-0 rounded-sm" style={{ backgroundColor: settings.primaryColor }} />
          )}
          <span className="truncate">{name}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 bg-background px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logoUrl} alt="" className="size-7 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="size-7 shrink-0 rounded-md" style={{ backgroundColor: settings.primaryColor }} />
          )}
          <span className="truncate font-semibold text-foreground" style={{ fontFamily: settings.font }}>
            {name}
          </span>
        </div>
        <Button size="sm" style={{ backgroundColor: settings.primaryColor }}>
          Get started
        </Button>
      </div>
    </div>
  );
}
