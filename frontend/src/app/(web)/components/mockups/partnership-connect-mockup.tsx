"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Handshake } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { INSTITUTION_LOGOS, PARTNER_LOGOS } from "@/lib/public-assets";
import { MockupCard, MockupFrame } from "./mockup-frame";

// Whoever is being sold to sits still on the left; the network they would gain streams past them
// on the right. A counselor partners with many institutions, an institution recruits through many
// counselors — same animation, opposite stream.
type Party = {
  name: string;
  location: string;
  badge: string;
  /** Omitted where we have no mark in the bucket — the monogram stands in. */
  logo?: string;
  initials: string;
};

// Logos come from our own public GCS bucket (sourced from Wikipedia/Wikimedia) rather than being
// hotlinked, so the mockup never depends on a third party staying up.
const INSTITUTIONS: Party[] = [
  { name: "University of Toronto", location: "Toronto, Canada", logo: INSTITUTION_LOGOS.toronto, initials: "UT", badge: "Institution · Verified" },
  { name: "University of Melbourne", location: "Melbourne, Australia", logo: INSTITUTION_LOGOS.melbourne, initials: "UM", badge: "Institution · Verified" },
  { name: "University of Manchester", location: "Manchester, UK", logo: INSTITUTION_LOGOS.manchester, initials: "UM", badge: "Institution · Verified" },
  { name: "Arizona State University", location: "Phoenix, USA", logo: INSTITUTION_LOGOS.asu, initials: "AS", badge: "Institution · Verified" },
  { name: "National University of Singapore", location: "Singapore", logo: INSTITUTION_LOGOS.nus, initials: "NU", badge: "Institution · Verified" },
];

// Stand-in agencies, not real partners — every mark is a file in our own public bucket.
const COUNSELORS: Party[] = [
  { name: "Apex Education Partners", location: "Dubai, UAE", logo: PARTNER_LOGOS.apex, initials: "AE", badge: "Education Counselor · 156 students" },
  { name: "Northstar Study Abroad", location: "Kathmandu, Nepal", logo: PARTNER_LOGOS.northstar, initials: "NS", badge: "Education Counselor · 210 students" },
  { name: "BrightPath Counselling", location: "Hyderabad, India", logo: PARTNER_LOGOS.brightPath, initials: "BP", badge: "Education Counselor · 184 students" },
  { name: "Mekong Education Group", location: "Ho Chi Minh City, Vietnam", logo: PARTNER_LOGOS.mekong, initials: "MK", badge: "Education Counselor · 132 students" },
  { name: "Silverline Education", location: "Lagos, Nigeria", logo: PARTNER_LOGOS.silverline, initials: "SL", badge: "Education Counselor · 98 students" },
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

/**
 * Square logo tile. Built on Avatar purely for its fallback behaviour — a missing or broken
 * logo file degrades to the monogram instead of a broken-image icon.
 */
function CardLogo({ src, alt, initials }: Readonly<{ src?: string; alt: string; initials: string }>) {
  return (
    <Avatar className="h-10 w-10 rounded-lg border border-border bg-white mb-2">
      {src && <AvatarImage src={src} alt={alt} className="object-contain p-1" />}
      <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function PartyCard({ party }: Readonly<{ party: Party }>) {
  return (
    <>
      <CardLogo src={party.logo} alt={`${party.name} logo`} initials={party.initials} />
      <div className="text-sm font-semibold text-foreground truncate">{party.name}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{party.location}</div>
      <Badge variant="secondary" className="mt-2 text-[10px]">{party.badge}</Badge>
    </>
  );
}

/**
 * `audience` names who is reading the page, not what is drawn: their own kind is the still card,
 * the network they would gain is the one that cycles.
 */
export function PartnershipConnectMockup({
  audience = "counselor",
}: Readonly<{ audience?: "counselor" | "institution" }>) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("in");
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

  const forInstitution = audience === "institution";
  const fixed = forInstitution ? INSTITUTIONS[0]! : COUNSELORS[0]!;
  const stream = forInstitution ? COUNSELORS : INSTITUTIONS;

  // Each cycle: slide in, hold, slide out, then advance to the next partner and reset to "in".
  // Resetting inside the last timeout rather than in the effect body keeps this off the
  // synchronous render path.
  useEffect(() => {
    if (reducedMotion) return;
    const toHold = setTimeout(() => setPhase("hold"), IN_MS);
    const toOut = setTimeout(() => setPhase("out"), IN_MS + HOLD_MS);
    const toNext = setTimeout(() => {
      setIndex((i) => (i + 1) % stream.length);
      setPhase("in");
    }, CYCLE_MS);
    return () => {
      clearTimeout(toHold);
      clearTimeout(toOut);
      clearTimeout(toNext);
    };
  }, [index, reducedMotion, stream.length]);

  // Apex is the still card on the institution variant as well as the first counselor in the
  // stream, so that variant starts one along — nothing is ever shown partnered with itself.
  const partner = stream[forInstitution ? (index + 1) % stream.length : index]!;

  const cardTransform =
    phase === "in" ? "translateY(40px)" : phase === "out" ? "translateY(-40px)" : "translateY(0)";
  const cardOpacity = phase === "hold" ? 1 : 0;
  const connected = phase === "hold";

  return (
    <MockupFrame label="business portal / partnerships">
      <div className="relative py-4">
        <div className="grid grid-cols-2 gap-3 relative z-10 items-stretch">
          {/* The side reading the page — always still, always left */}
          <MockupCard className="p-4">
            <PartyCard party={fixed} />
          </MockupCard>

          {/* The network they gain — cycles through */}
          <div className="relative overflow-hidden" style={{ minHeight: 132 }}>
            <MockupCard
              className="p-4 absolute inset-0"
              style={{
                transform: cardTransform,
                opacity: reducedMotion ? 1 : cardOpacity,
                transition: "transform 500ms cubic-bezier(0.22,1,0.36,1), opacity 400ms ease-out",
              }}
            >
              <PartyCard party={partner} />
            </MockupCard>
          </div>
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
        {connected || reducedMotion ? `Partnered with ${partner.name}` : "Connecting…"}
      </div>
    </MockupFrame>
  );
}
