"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReveal } from "@/hooks/use-reveal";

/** Fades a block up the first time it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: Readonly<{ children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section" }>) {
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <Tag
      ref={ref as never}
      className={cn("reveal", className)}
      data-visible={visible || undefined}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

