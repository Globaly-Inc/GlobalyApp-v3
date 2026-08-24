import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MEDIA_URL } from "../../const/index";
import { Reveal } from "../../components/reveal";

const POINTS = [
  {
    title: "Verified Public Agent Profile",
    desc: "Showcase your services, accreditations, and institution partnerships where students and providers are actively searching.",
  },
  {
    title: "Direct Connections with Institutions",
    desc: "Build partnerships with universities and colleges globally — no middlemen, no extra commission cuts.",
  },
  {
    title: "Boost Visibility to Students",
    desc: "Appear on course and institution profiles as a verified local representative, attracting more direct inquiries.",
  },
  {
    title: "Grow Your Network and Reputation",
    desc: "Position your agency as a trusted, independent education partner in a transparent, commission-free marketplace.",
  },
];

export function PartnershipsSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <Reveal direction="left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${MEDIA_URL}/partnership-meeting.jpg`}
              alt="Education agent and university representatives shaking hands in a business meeting"
              loading="lazy"
              width={1280}
              height={960}
              className="w-full h-auto rounded-2xl shadow-xl object-cover aspect-[4/3]"
            />
          </Reveal>
          <Reveal direction="right">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Get Discovered. Build <span className="highlight-text active">Direct Partnerships.</span>
            </h2>
            <p className="text-muted-foreground mb-8">
              With Globaly.app, you&apos;re in control. List your verified profile, connect directly with
              universities and colleges worldwide, and expand your reach without relying on intermediaries or
              aggregators.
            </p>
            <div className="space-y-5">
              {POINTS.map((item) => (
                <div key={item.title} className="flex gap-3">
                  <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-8">
              <Button className="rounded-full px-8" render={<Link href="/auth/sign-up" />}>
                Claim Your Agent Profile
              </Button>
              <Button variant="outline" className="rounded-full" render={<Link href="/search?tab=institutions" />}>
                Start Exploring
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
