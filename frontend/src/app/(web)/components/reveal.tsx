"use client";

import type { ReactNode } from "react";
import { useScrollReveal } from "../hooks/use-scroll-animation";

interface RevealProps {
  children: ReactNode;
  className?: string;
  direction?: "up" | "left" | "right";
  delay?: number;
}

const REVEAL_CLASS_BY_DIRECTION = {
  up: "reveal",
  left: "reveal-left",
  right: "reveal-right",
} as const;

export function Reveal({ children, className = "", direction = "up", delay = 0 }: Readonly<RevealProps>) {
  const { ref, isVisible } = useScrollReveal();
  const directionClass = REVEAL_CLASS_BY_DIRECTION[direction];

  return (
    <div
      ref={ref as never}
      className={`${directionClass} ${isVisible ? "visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
