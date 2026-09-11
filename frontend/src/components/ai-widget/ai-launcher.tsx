"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { AiPopover } from "./ai-popover";

export function AiLauncher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Don't show the floating button on the full AI page
  if (pathname === "/personal/ai") return null;

  return (
    <>
      {open && <AiPopover onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-white text-foreground shadow-xl ring-1 ring-black/10 transition-transform hover:scale-105 md:bottom-6 cursor-pointer"
        aria-label={open ? "Close Ask Aly" : "Ask Aly"}
      >
        {open ? <X className="h-5 w-5" /> : <AlyOrbIcon className="h-11 w-11 scale-[1.5]" />}
      </button>
    </>
  );
}
