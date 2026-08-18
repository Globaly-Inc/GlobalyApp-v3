"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface LegalTocProps {
  items: { id: string; label: string }[];
}

export function LegalToc({ items }: Readonly<LegalTocProps>) {
  const [activeId, setActiveId] = useState(items[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    items.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="hidden lg:block">
      <div className="sticky top-24">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">On this page</p>
        <ul className="flex flex-col gap-1 border-l border-border">
          {items.map(({ id, label }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={cn(
                  "-ml-px block border-l-2 border-transparent py-1 pl-4 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  activeId === id && "border-primary font-medium text-primary",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
