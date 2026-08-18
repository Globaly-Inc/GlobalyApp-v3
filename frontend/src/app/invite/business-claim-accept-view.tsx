"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inviteApi } from "./apis";

type Status = "loading" | "success" | "error";

export function BusinessClaimAcceptView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  const requestedRef = useRef(false);
  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;

    if (!token) {
      setStatus("error");
      setMessage("This claim link is missing required information.");
      return;
    }
    inviteApi
      .acceptBusinessClaim(token)
      .then((result) => {
        setStatus("success");
        setEmail(result.email);
        setMessage(`${result.business_name} is now claimed. Sign in with your email to continue.`);
      })
      .catch((err: Error) => {
        setStatus("error");
        setMessage(err.message || "This claim link is invalid or has expired.");
      });
  }, [token]);

  const signInHref = email ? `/auth/sign-in?email=${encodeURIComponent(email)}` : "/auth/sign-in";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src="/globaly-logo.png" alt="Globaly.io" width={753} height={157} className="h-10 w-auto" />
          </Link>
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
              {status === "success" && <CheckCircle2 className="h-10 w-10 text-primary" />}
              {status === "error" && <XCircle className="h-10 w-10 text-destructive" />}
            </div>
            <CardTitle className="text-2xl">
              {status === "loading" && "Claiming your account…"}
              {status === "success" && "Account claimed!"}
              {status === "error" && "Claim link invalid"}
            </CardTitle>
            {status !== "loading" && <CardDescription>{message}</CardDescription>}
          </CardHeader>
          {status !== "loading" && (
            <CardContent>
              <Button className="h-10 w-full cursor-pointer" onClick={() => router.push(signInHref)}>
                Continue to Sign In
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
