"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WidgetLauncherPreview } from "./widget-launcher-preview";

/** A stand-in for the owner's own website, so the widget can be tried before it is embedded. */
export function WidgetPreviewView({ embedKey }: Readonly<{ embedKey: string }>) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" render={<Link href="/business/ai-widget" />}>
          <ArrowLeft className="size-4" /> Back to widgets
        </Button>
        <p className="text-xs text-muted-foreground">Sample page · the orb bottom-right is your live widget</p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b bg-muted/40 px-6 py-3 text-sm font-semibold">Your website</div>
        <div className="flex flex-col gap-6 px-6 py-8">
          <div>
            <h1 className="text-2xl font-semibold">Study with us</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This is what a visitor sees on your site. Open the widget in the corner and ask it something.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {["Courses", "Admissions", "Fees & scholarships"].map((t) => (
              <div key={t} className="rounded-md border p-4">
                <p className="text-sm font-medium">{t}</p>
                <div className="mt-2 h-2 w-3/4 rounded bg-muted" />
                <div className="mt-1.5 h-2 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <WidgetLauncherPreview embedKey={embedKey} />
    </div>
  );
}
