"use client";

import { useEffect, useState } from "react";
import { Reveal } from "../../components/reveal";
import { HOW_IT_WORKS } from "../static/for-institutions-content";

const COUNT = HOW_IT_WORKS.length;
const AUTO_MS = 3200;

export function HowItWorksSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % COUNT), AUTO_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="py-16 bg-primary/5 overflow-hidden">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            How It <span className="highlight-text active">Works</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Follow these simple steps to expand your global reach
          </p>
        </Reveal>

        <div className="relative h-64 md:h-56">
          {HOW_IT_WORKS.map((step, i) => {
            // Signed, shortest wrap-around offset from the active card — e.g. -2..2 for 5 items —
            // so the active one is always rendered at the visual center, others slide around it.
            let offset = i - active;
            if (offset > COUNT / 2) offset -= COUNT;
            if (offset < -COUNT / 2) offset += COUNT;

            const distance = Math.abs(offset);
            const isActive = distance === 0;
            const isNear = distance === 1;
            const scale = isActive ? 1 : isNear ? 0.82 : 0.68;
            const spacing = 260; // px between card centers

            return (
              <button
                key={step.title}
                type="button"
                onClick={() => setActive(i)}
                aria-current={isActive}
                className="absolute left-1/2 top-1/2 text-left transition-all duration-500 ease-out cursor-pointer"
                style={{
                  transform: `translate(-50%, -50%) translateX(${offset * spacing}px) scale(${scale})`,
                  opacity: isActive ? 1 : isNear ? 0.55 : 0.3,
                  zIndex: 10 - distance,
                  width: "15rem",
                }}
              >
                <div
                  className={`rounded-2xl p-6 flex flex-col text-center items-center transition-all duration-500 ${
                    isActive ? "bg-background shadow-xl" : "bg-background/70 shadow-sm"
                  }`}
                >
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <step.Icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-bold mb-2">{step.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-2 mt-6">
          {HOW_IT_WORKS.map((step, i) => (
            <button
              key={step.title}
              type="button"
              aria-label={`Show step ${i + 1}`}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-6 bg-primary" : "w-1.5 bg-primary/20"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
