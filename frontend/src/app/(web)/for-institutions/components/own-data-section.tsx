"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";
import { useParallax } from "../../hooks/use-scroll-animation";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { OWN_DATA_ITEMS, OWN_DATA_PHOTO_URL } from "../static/for-institutions-content";

export function OwnDataSection() {
  const { ref: parallaxRef, transform } = useParallax(0.2);
  const isMobile = useIsMobile();

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <Reveal direction="left">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Own Your <span className="highlight-text active">Course Data.</span> Be Seen
              Everywhere.
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              With Globaly.app, your institution controls its course data, agent connections, and
              partnerships — managing listings in real time on a global open marketplace with
              transparent, predictable pricing.
            </p>
            <div className="space-y-5">
              {OWN_DATA_ITEMS.map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-0.5 flex items-center gap-2">
                      {item.title}
                      {item.comingSoon && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          Coming Soon
                        </Badge>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button
              className="mt-8 rounded-full px-6"
              style={{ background: "hsl(var(--purple-dark))", color: "white" }}
              render={<Link href="/auth/sign-up" />}
            >
              Claim Your Institution Profile
            </Button>
          </Reveal>
          <Reveal direction="right">
            <div
              ref={parallaxRef as never}
              className="parallax-wrap rounded-2xl overflow-hidden shadow-xl"
              style={{ height: "420px" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={OWN_DATA_PHOTO_URL}
                alt="University faculty hallway"
                style={{ transform: isMobile ? undefined : transform }}
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
