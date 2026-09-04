"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteApi } from "./apis";
import { LOGO } from "@/lib/public-assets";

// One view for both kinds — a business and an institution claim are the same flow, the two
// tables exist only to keep the rows apart. `kind` picks the endpoint and the wording.
type Kind = "business" | "institution";

type Status = "form" | "submitting" | "success" | "error";

/**
 * Unlike the agent-invite flow, this does NOT accept on mount.
 *
 * A promoted listing has no owner: extraction captures a company email but never a contact
 * person, so `first_name`/`last_name` are NULL until someone claims it. Those names are
 * collected here — accepting creates the claimant's platform_user from them and writes them onto
 * the listing row. That is why there is a form to fill rather than an automatic redirect.
 */
export function ClaimAcceptView({ kind }: Readonly<{ kind: Kind }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [status, setStatus] = useState<Status>(token ? "form" : "error");
  const [message, setMessage] = useState(token ? "" : "This claim link is missing required information.");
  const [email, setEmail] = useState<string | null>(null);

  const noun = kind === "institution" ? "institution" : "business";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setStatus("submitting");
    try {
      const params = { token, first_name: firstName.trim(), last_name: lastName.trim() };
      const result =
        kind === "institution"
          ? await inviteApi.acceptInstitutionClaim(params)
          : await inviteApi.acceptBusinessClaim(params);

      const name = "institution_name" in result ? result.institution_name : result.business_name;
      setEmail(result.email);
      setMessage(`${name} is now claimed. Sign in with your email to continue.`);
      setStatus("success");
    } catch (err) {
      setMessage((err as Error).message || "This claim link is invalid or has expired.");
      setStatus("error");
    }
  };

  const signInHref = email ? `/auth/sign-in?email=${encodeURIComponent(email)}` : "/auth/sign-in";
  const canSubmit = Boolean(firstName.trim() && lastName.trim()) && status !== "submitting";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src={LOGO.src} alt="Globalyapp" width={LOGO.width} height={LOGO.height} className="h-10 w-auto" />
          </Link>
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              {status === "submitting" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
              {status === "success" && <CheckCircle2 className="h-10 w-10 text-primary" />}
              {status === "error" && <XCircle className="h-10 w-10 text-destructive" />}
            </div>
            <CardTitle className="text-2xl">
              {status === "form" && `Claim your ${noun}`}
              {status === "submitting" && "Claiming your account…"}
              {status === "success" && "Account claimed!"}
              {status === "error" && "Claim link invalid"}
            </CardTitle>
            {status === "form" && (
              <CardDescription>Tell us your name so we can set up your account.</CardDescription>
            )}
            {(status === "success" || status === "error") && <CardDescription>{message}</CardDescription>}
          </CardHeader>

          <CardContent>
            {(status === "form" || status === "submitting") && (
              // flex/gap, not space-y — see frontend/AGENTS.md on the focus-guard spacing bug.
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="first_name">First name</Label>
                  <Input
                    id="first_name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={status === "submitting"}
                    autoComplete="given-name"
                    maxLength={100}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input
                    id="last_name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={status === "submitting"}
                    autoComplete="family-name"
                    maxLength={100}
                    required
                  />
                </div>
                <Button type="submit" className="h-10 w-full cursor-pointer" disabled={!canSubmit}>
                  {status === "submitting" ? "Claiming…" : `Claim ${noun}`}
                </Button>
              </form>
            )}

            {(status === "success" || status === "error") && (
              <Button className="h-10 w-full cursor-pointer" onClick={() => router.push(signInHref)}>
                Continue to Sign In
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
