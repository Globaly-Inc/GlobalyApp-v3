import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MEDIA_URL } from "../../const/index";
import { Reveal } from "../../components/reveal";

const POINTS = [
  {
    title: "Verified, Course-Matched Leads",
    desc: "Only receive student enquiries that match your institution partnerships and the courses you represent.",
  },
  /* Parked with the eligibility checker:
  {
    title: "Built-In Free Eligibility Check",
    desc: "Instantly assess academic, English, and visa eligibility before committing to a lead — manage expectations early and boost conversion rates.",
  },
  */
  {
    title: "Flexible, Lead-Based Payments",
    desc: "Pay only for the leads you choose to unlock. No hidden fees, no aggregator commission deals behind your back.",
  },
  {
    title: "Faster Student Acquisition",
    desc: "Spend less time qualifying students and more time securing enrollments with pre-filtered, motivated applicants.",
  },
];

export function QualifiedLeadsSection() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <Reveal direction="left">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Get <span className="highlight-text active">Qualified & Verified</span> Student Leads Instantly
            </h2>
            <p className="text-muted-foreground mb-8">
              Stop wasting time on unfiltered inquiries. With Globalyapp, you&apos;ll receive highly qualified,
              verified student leads actively looking to apply. Focus on closing real students, not
              chasing dead ends.
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
            <Button className="mt-8 rounded-full px-8" render={<Link href="/auth/sign-up" />}>
              Start Generating Leads
            </Button>
          </Reveal>
          <Reveal direction="right">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${MEDIA_URL}/students-campus-walk.jpg`}
                alt="International students walking together across a university campus"
                loading="lazy"
                width={1280}
                height={960}
                className="w-full h-auto rounded-2xl shadow-xl object-cover aspect-[4/3]"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
