import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "../reveal";

interface LegalContactCardProps {
  description: string;
}

export function LegalContactCard({ description }: Readonly<LegalContactCardProps>) {
  return (
    <Reveal>
      <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl bg-linear-to-br from-primary/10 via-primary/5 to-transparent p-8 text-center ring-1 ring-primary/15">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Mail className="size-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Still have questions?</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        <Button render={<a href="mailto:support@globaly.app">Contact support@globaly.app</a>} />
      </div>
    </Reveal>
  );
}
