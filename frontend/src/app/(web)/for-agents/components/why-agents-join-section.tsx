import { UserCheck, Handshake, Sparkles, ClipboardCheck, BadgePercent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";

const BENEFITS = [
  {
    Icon: UserCheck,
    title: "List Your Profile & Build Your Reputation",
    desc: "Create your verified agent profile, showcase your services, accreditations, and partnerships. Get discovered by students and providers actively searching for local representatives like you.",
  },
  {
    Icon: Handshake,
    title: "Connect Directly with Institutions",
    desc: "Globaly.app lets you build direct partnerships with universities, colleges, and providers around the world — no gatekeepers, no middlemen. Represent institutions independently. Grow your portfolio.",
  },
  {
    Icon: Sparkles,
    title: "Get Highly Qualified, Verified Leads",
    desc: "Receive student leads that are course-matched, eligibility-checked, and genuinely looking to apply. Only pay for the leads you unlock — no hidden fees, no surprises. More quality, less hassle. Real students, real opportunities.",
  },
  {
    Icon: ClipboardCheck,
    title: "Free Eligibility Testing for Your Students",
    desc: "Use our smart, free eligibility check to instantly assess if a student qualifies for a course based on academic scores, English requirements, and other key criteria. Save time. Manage student expectations early. Close more applications.",
  },
  {
    Icon: BadgePercent,
    title: "Transparent, Fair Pricing",
    desc: "Enjoy a transparent platform with simple, predictable pricing. No hidden fees, no deductions — just pure value for your services.",
    badge: "Coming Soon",
  },
];

export function WhyAgentsJoinSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Why Education Agents Join <span className="highlight-text active">Globaly.app?</span>
          </h2>
          <p className="text-muted-foreground">
            More Leads. Direct Connections. Smarter Tools. Open Opportunities.{" "}
            <span className="text-primary font-medium">All in One Place.</span>
          </p>
        </Reveal>
        <div className="grid md:grid-cols-2 gap-6">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.1}>
              <div className="border border-border rounded-2xl p-6 bg-muted/20 hover:border-primary/30 hover:shadow-md transition-all h-full">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <b.Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1 flex items-center gap-2 flex-wrap">
                      {b.title}
                      {b.badge && (
                        <Badge variant="secondary" className="text-xs">
                          {b.badge}
                        </Badge>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
