import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BlogCta() {
  return (
    <section className="bg-[hsl(var(--purple-dark))] text-white py-12">
      <div className="container max-w-2xl mx-auto px-4 text-center">
        <h2 className="text-xl font-bold mb-2">Ready to start your journey?</h2>
        <p className="text-sm text-white/70 mb-6">
          Explore courses, find education agents, and apply to top universities — all on Globalyapp.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button className="gap-1.5 btn-gold" nativeButton={false} render={<Link href="/search?tab=courses" />}>
            Search Courses <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
            nativeButton={false}
            render={<Link href="/search?tab=education-agencies" />}
          >
            Find an Agent
          </Button>
        </div>
      </div>
    </section>
  );
}
