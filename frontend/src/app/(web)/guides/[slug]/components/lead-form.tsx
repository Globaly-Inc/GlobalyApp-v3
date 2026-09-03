"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

// Deliberately not a full RFC 5322 regex — enough to catch obvious typos before a round trip.
// The backend's Zod z.string().email() is the source of truth for what's actually valid.
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf("@");
  if (at < 1 || value.includes(" ")) return false;
  const domain = value.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

export function LeadForm({ slug }: Readonly<{ slug: string }>) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real visitors never see this field
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your name.");
    if (!looksLikeEmail(email.trim())) return setError("Enter a valid email address.");

    setStatus("submitting");
    try {
      const res = await fetch(`${API_BASE}/public/guides/${slug}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), website }),
      });
      if (!res.ok) throw new Error("request failed");
      setStatus("done");
    } catch {
      setStatus("idle");
      setError("Something went wrong. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="h-5 w-5" />
        </span>
        <p className="font-semibold text-foreground">Check your inbox</p>
        <p className="text-sm text-muted-foreground">We&apos;ve emailed you the guide.</p>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-name">Name</Label>
        <Input id="lead-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your full name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-email">Email</Label>
        <Input id="lead-email" type="email" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@example.com" />
      </div>

      {/* Honeypot: hidden from sighted/keyboard users, but present in the DOM for bots that fill every field. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="lead-website">Website</label>
        <input id="lead-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      <Button type="submit" className="mt-1 h-10" disabled={status === "submitting"}>
        {status === "submitting" ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending…</> : "Get the guide"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">We&apos;ll only email you the guide. No spam.</p>
    </form>
  );
}
