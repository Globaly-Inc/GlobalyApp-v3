import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";

export function CtaSection() {
  return (
    <section className="py-20 bg-[hsl(var(--purple-dark))] text-white overflow-hidden relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://images.pexels.com/photos/7793999/pexels-photo-7793999.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-20"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--purple-dark))]/85 to-[hsl(var(--purple-dark))]" />
      <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--gold))]/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

      <div className="container relative mx-auto px-4 text-center z-10">
        <Reveal>
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to scale your consultancy?</h2>
          <p className="text-white/70 text-lg mb-10 max-w-2xl mx-auto">
            Join Globaly.app today and connect with thousands of students and hundreds of top-tier institutions
            worldwide.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="btn-gold rounded-full px-10 h-11" render={<Link href="/auth/sign-up" />}>
              Get Started Free
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 rounded-full px-10 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
              render={<Link href="/search?tab=institutions" />}
            >
              Explore Institutions
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
