import Link from "next/link";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CountryCta({ countryName }: Readonly<{ countryName: string }>) {
  return (
    <section className="rounded-2xl bg-primary p-10 text-center text-primary-foreground">
      <Globe className="mx-auto mb-4 h-12 w-12 opacity-80" />
      <h2 className="text-2xl font-bold">Your Journey Starts Here</h2>
      <p className="mx-auto mt-2 max-w-xl text-primary-foreground/80">
        Connect with verified institutions and agents who specialize in {countryName} placements.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button className="h-10" variant="secondary" render={<Link href="/auth/sign-up" />}>
          Get Started Free
        </Button>
        <Button
          variant="outline"
          className="h-10 border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          render={<Link href={`/search?tab=courses&country=${encodeURIComponent(countryName)}`} />}
        >
          Browse Courses
        </Button>
      </div>
    </section>
  );
}
