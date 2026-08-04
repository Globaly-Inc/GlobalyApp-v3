"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "md:hidden fixed bottom-6 right-4 z-50",
        "h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg",
        "flex items-center justify-center transition-all duration-200",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
