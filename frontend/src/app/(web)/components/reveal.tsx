"use client";

import type { ReactNode } from "react";
import { useScrollReveal } from "../hooks/use-scroll-animation";
import { REVEAL_CLASS_BY_DIRECTION } from "../const/index";

interface RevealProps {
  children: ReactNode;
  className?: string;
  direction?: "up" | "left" | "right";
  delay?: number;
}

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
