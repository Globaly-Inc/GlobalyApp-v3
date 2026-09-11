"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const CHECKERBOARD = {
  backgroundImage:
    "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
};

export type LogoPreviewProps = Readonly<{ src: string }>;

/** Extracted logos are frequently a white/reversed variant meant for the source site's own
 * colored navbar — invisible against a plain white card. Defaults to a checkerboard backdrop
 * (same convention as Photoshop/Figma transparency previews); the toggle switches to solid
 * black for a white/light logo that's still invisible against the checkerboard's light tone.
 * We can't know which a given logo needs without actually inspecting its pixels, so this is a
 * manual per-logo choice rather than something the extraction pipeline can decide for you. */
export function LogoPreview({ src }: LogoPreviewProps) {
  const [dark, setDark] = useState(false);

  return (
    <div className="group/logo relative h-16 w-16 shrink-0">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-xl border p-1"
        style={dark ? { backgroundColor: "#000" } : CHECKERBOARD}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- extracted logos are arbitrary remote hosts */}
        <img src={src} alt="" className="h-full w-full object-contain" />
      </div>
      <Button
        variant="secondary"
        size="icon-sm"
        className="absolute -bottom-1.5 -right-1.5 h-5 w-5 cursor-pointer rounded-full opacity-0 shadow-sm transition-opacity group-hover/logo:opacity-100"
        title={dark ? "Switch to light background" : "Switch to dark background"}
        onClick={() => setDark((v) => !v)}
      >
        {dark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
      </Button>
    </div>
  );
}
