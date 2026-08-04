import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-32 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground">404</h1>
      <p className="max-w-md text-muted-foreground">This page doesn&apos;t exist.</p>
      <Button render={<Link href="/">Go home</Link>} />
    </div>
  );
}
