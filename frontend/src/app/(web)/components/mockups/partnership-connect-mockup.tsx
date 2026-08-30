"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Building2, Briefcase, Globe2, Compass, Sparkles, GraduationCap, Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MockupCard, MockupFrame } from "./mockup-frame";

const AGENCIES = [
  { name: "Horizon Edu Agency", location: "Mumbai, India", students: 240, Icon: Building2 },
  { name: "Global Pathways Consult", location: "Lagos, Nigeria", students: 180, Icon: Briefcase },
  { name: "Nova Study Abroad", location: "São Paulo, Brazil", students: 312, Icon: Globe2 },
  { name: "Apex Education Partners", location: "Dubai, UAE", students: 156, Icon: Compass },
  { name: "Bright Future Consultancy", location: "Manila, Philippines", students: 205, Icon: Sparkles },
];

const CYCLE_MS = 3200;
const IN_MS = 500;
const HOLD_MS = 2200;

type Phase = "in" | "hold" | "out";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function PartnershipConnectMockup() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("in");
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

  // Each cycle: slide in, hold, slide out, then advance to the next agency and reset to "in".
  // Resetting inside the last timeout rather than in the effect body keeps this off the
  // synchronous render path.
  useEffect(() => {
    if (reducedMotion) return;
    const toHold = setTimeout(() => setPhase("hold"), IN_MS);
    const toOut = setTimeout(() => setPhase("out"), IN_MS + HOLD_MS);
    const toNext = setTimeout(() => {
      setIndex((i) => (i + 1) % AGENCIES.length);
      setPhase("in");
    }, CYCLE_MS);
    return () => {
      clearTimeout(toHold);
      clearTimeout(toOut);
      clearTimeout(toNext);
    };
  }, [index, reducedMotion]);

  const agency = AGENCIES[index]!;
  const AgencyIcon = agency.Icon;

  const cardTransform =
    phase === "in" ? "translateY(40px)" : phase === "out" ? "translateY(-40px)" : "translateY(0)";
  const cardOpacity = phase === "hold" ? 1 : 0;
  const connected = phase === "hold";

  return (
    <MockupFrame label="business portal / partnerships">
      <div className="relative py-4">
        <div className="grid grid-cols-2 gap-3 relative z-10 items-stretch">
          {/* Rotating agency card */}
          <div className="relative overflow-hidden" style={{ minHeight: 132 }}>
            <MockupCard
              className="p-4 absolute inset-0"
              style={{
                transform: cardTransform,
                opacity: reducedMotion ? 1 : cardOpacity,
                transition: "transform 500ms cubic-bezier(0.22,1,0.36,1), opacity 400ms ease-out",
              }}
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <AgencyIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="text-sm font-semibold text-foreground truncate">{agency.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{agency.location}</div>
              <Badge variant="secondary" className="mt-2 text-[10px]">
                Education Counselor · {agency.students} students
              </Badge>
            </MockupCard>
          </div>

          {/* Fixed institution card */}
          <MockupCard className="p-4">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div className="text-sm font-semibold text-foreground">University of Toronto</div>
            <div className="text-xs text-muted-foreground mt-0.5">Toronto, Canada</div>
            <Badge variant="secondary" className="mt-2 text-[10px]">
              Institution · Verified
            </Badge>
          </MockupCard>
        </div>

        {/* Connector line */}
        <svg
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-0 pointer-events-none"
          width="100%"
          height="2"
          aria-hidden="true"
        >
          <line
            x1="15%"
            y1="1"
            x2="85%"
            y2="1"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeDasharray="6 6"
            style={{ opacity: connected || reducedMotion ? 0.6 : 0, transition: "opacity 400ms ease-out" }}
          />
        </svg>

        {/* Center handshake badge */}
        <div
          className="absolute left-1/2 top-1/2 z-20"
          style={{
            transform: `translate(-50%, -50%) scale(${connected || reducedMotion ? 1 : 0.4})`,
            opacity: connected || reducedMotion ? 1 : 0,
            transition: "transform 400ms cubic-bezier(0.34,1.56,0.64,1), opacity 300ms ease-out",
          }}
        >
          <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg border-4 border-background">
            <Handshake className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div
        className="text-center text-xs text-muted-foreground"
        style={{ opacity: connected || reducedMotion ? 1 : 0.4, transition: "opacity 300ms ease-out" }}
      >
        {connected || reducedMotion ? `Partnered with ${agency.name}` : "Connecting…"}
      </div>
    </MockupFrame>
  );
}
