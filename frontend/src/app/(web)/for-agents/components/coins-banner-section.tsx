import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";

export function CoinsBannerSection() {
  return (
    <section className="relative py-16 border-y border-[hsl(var(--gold))]/20 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://images.pexels.com/photos/9572378/pexels-photo-9572378.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--purple-dark))]/90 via-[hsl(var(--purple-dark))]/80 to-[hsl(var(--purple-dark))]/70" />
      <div className="container relative mx-auto px-4 text-center z-10">
        <Reveal>
          <p className="text-sm font-semibold text-[hsl(var(--gold))] mb-2">
            🎉 Limited-Time Offer for Education Counselors
          </p>
          <p className="text-white text-lg md:text-xl font-medium mb-6 max-w-3xl mx-auto leading-relaxed">
            Join Globalyapp today and get 100 FREE Globaly Coins — enough to unlock 10+ verified, course-matched
            student leads right away. No fees, no risk — just real opportunities.
            {/* Parked until the LMS ships: " Plus, access free training programs to boost your certifications." */}
          </p>
          <Button className="btn-gold rounded-full px-8" render={<Link href="/auth/sign-up" />}>
            Claim Free Coins
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
