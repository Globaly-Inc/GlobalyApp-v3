import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";
import { PartnershipConnectMockup } from "../../components/mockups/partnership-connect-mockup";
import { AGENT_NETWORK_ITEMS } from "../static/for-institutions-content";

export function AgentNetworkSection() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <Reveal direction="left">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Build Your <span className="highlight-text active">Agent Network.</span> Get
              Pre-Checked Student Leads. Process Faster.
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              With Globaly.app, you can connect directly with verified agents, receive
              eligibility-checked student inquiries, and manage your agent network, events, and
              recruitment performance — all from one platform.
            </p>
            <div className="space-y-5">
              {AGENT_NETWORK_ITEMS.map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-0.5">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-8">
              <Button
                className="rounded-full px-6"
                style={{ background: "hsl(var(--purple-dark))", color: "white" }}
                render={<Link href="/auth/sign-up" />}
              >
                Start Building My Network
              </Button>
              <Button variant="outline" className="rounded-full" render={<Link href="/search?tab=education-agencies" />}>
                Explore Agents
              </Button>
            </div>
          </Reveal>
          <Reveal direction="right">
            <PartnershipConnectMockup />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
