import Link from "next/link";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";

export function CountryCta({ countryName }: Readonly<{ countryName: string }>) {
  return (
    <Reveal className="rounded-2xl bg-primary p-6 text-center text-primary-foreground sm:p-10">
      <Globe className="mx-auto mb-4 h-10 w-10 opacity-80 sm:h-12 sm:w-12" />
      <h2 className="text-xl font-bold sm:text-2xl">Your Journey Starts Here</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-primary-foreground/80 sm:text-base">
        Connect with verified institutions and education counselors who specialize in {countryName} placements.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
        <Button className="h-10 w-full sm:w-auto" variant="secondary" render={<Link href="/auth/sign-up" />}>
          Get Started Free
        </Button>
        <Button
          variant="outline"
          className="h-10 w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
          render={<Link href={`/search?tab=courses&country=${encodeURIComponent(countryName)}`} />}
        >
          Browse Courses
        </Button>
      </div>
    </Reveal>
  );
}
