"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Handshake } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { INSTITUTION_LOGOS } from "@/lib/public-assets";
import { MockupCard, MockupFrame } from "./mockup-frame";

// A counselor partners with many institutions, so the institution side is what rotates — one
// counselor on the right, a stream of universities connecting to it on the left.
// Logos come from our own public GCS bucket (sourced from Wikipedia/Wikimedia) rather than being
// hotlinked, so the mockup never depends on a third party staying up.
const INSTITUTIONS = [
  { name: "University of Toronto", location: "Toronto, Canada", logo: INSTITUTION_LOGOS.toronto },
  { name: "University of Melbourne", location: "Melbourne, Australia", logo: INSTITUTION_LOGOS.melbourne },
  { name: "University of Manchester", location: "Manchester, UK", logo: INSTITUTION_LOGOS.manchester },
  { name: "Arizona State University", location: "Phoenix, USA", logo: INSTITUTION_LOGOS.asu },
  { name: "National University of Singapore", location: "Singapore", logo: INSTITUTION_LOGOS.nus },
];

// Apex is a stand-in agency with no logo of its own — drop a real counselor's mark in
// /public/partners (see the README there) and it appears; until then the monogram shows.
const COUNSELOR = {
  name: "Apex Education Partners",
  location: "Dubai, UAE",
  students: 156,
  logo: "/partners/apex-education-partners.png",
  initials: "AE",
};

/** "University of Toronto" -> "UT". Only used if a logo file ever goes missing. */
const institutionInitials = (name: string) =>
  name.split(" ").filter((w) => w[0] === w[0]?.toUpperCase() && w.length > 2).slice(0, 2).map((w) => w[0]).join("");

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

/**
 * Square logo tile. Built on Avatar purely for its fallback behaviour — a missing or broken
 * logo file degrades to the monogram instead of a broken-image icon.
 */
function CardLogo({ src, alt, initials }: Readonly<{ src: string; alt: string; initials: string }>) {
  return (
    <Avatar className="h-10 w-10 rounded-lg border border-border bg-white mb-2">
      <AvatarImage src={src} alt={alt} className="object-contain p-1" />
      <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function PartnershipConnectMockup() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("in");
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

  // Each cycle: slide in, hold, slide out, then advance to the next institution and reset to "in".
  // Resetting inside the last timeout rather than in the effect body keeps this off the
  // synchronous render path.
  useEffect(() => {
    if (reducedMotion) return;
    const toHold = setTimeout(() => setPhase("hold"), IN_MS);
    const toOut = setTimeout(() => setPhase("out"), IN_MS + HOLD_MS);
    const toNext = setTimeout(() => {
      setIndex((i) => (i + 1) % INSTITUTIONS.length);
      setPhase("in");
    }, CYCLE_MS);
    return () => {
      clearTimeout(toHold);
      clearTimeout(toOut);
      clearTimeout(toNext);
    };
  }, [index, reducedMotion]);

  const institution = INSTITUTIONS[index]!;

  const cardTransform =
    phase === "in" ? "translateY(40px)" : phase === "out" ? "translateY(-40px)" : "translateY(0)";
  const cardOpacity = phase === "hold" ? 1 : 0;
  const connected = phase === "hold";

  return (
    <MockupFrame label="business portal / partnerships">
      <div className="relative py-4">
        <div className="grid grid-cols-2 gap-3 relative z-10 items-stretch">
          {/* Rotating institution card */}
          <div className="relative overflow-hidden" style={{ minHeight: 132 }}>
            <MockupCard
              className="p-4 absolute inset-0"
              style={{
                transform: cardTransform,
                opacity: reducedMotion ? 1 : cardOpacity,
                transition: "transform 500ms cubic-bezier(0.22,1,0.36,1), opacity 400ms ease-out",
              }}
            >
              <CardLogo src={institution.logo} alt={`${institution.name} logo`} initials={institutionInitials(institution.name)} />
              <div className="text-sm font-semibold text-foreground truncate">{institution.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{institution.location}</div>
              <Badge variant="secondary" className="mt-2 text-[10px]">
                Institution · Verified
              </Badge>
            </MockupCard>
          </div>

          {/* Fixed education counselor card */}
          <MockupCard className="p-4">
            <CardLogo src={COUNSELOR.logo} alt={`${COUNSELOR.name} logo`} initials={COUNSELOR.initials} />
            <div className="text-sm font-semibold text-foreground truncate">{COUNSELOR.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{COUNSELOR.location}</div>
            <Badge variant="secondary" className="mt-2 text-[10px]">
              Education Counselor · {COUNSELOR.students} students
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
        {connected || reducedMotion ? `Partnered with ${institution.name}` : "Connecting…"}
      </div>
    </MockupFrame>
  );
}
