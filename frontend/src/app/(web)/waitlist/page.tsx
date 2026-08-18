import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { WaitlistForm } from "./components/waitlist-form";

export const metadata: Metadata = {
  title: "Join the waitlist — Globaly",
  description:
    "Register your interest in Globaly's AI Education Discovery agents and we will email you the moment it is ready to explore.",
};

export default function WaitlistPage() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <div className="mb-8 text-center">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">Join the waitlist</h1>
        <p className="mt-2 text-muted-foreground">
          We are building AI Education Discovery agents to help you find the right courses,
          institutions and pathways. Register your interest and we will email you the moment it is
          ready to explore.
        </p>
      </div>
      <WaitlistForm />
    </div>
  );
}
