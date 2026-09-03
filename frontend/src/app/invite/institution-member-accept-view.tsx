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

export function InstitutionMemberAcceptInviteView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const orgId = searchParams.get("org_id");
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  const requestedRef = useRef(false);
  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;

    if (!token || !orgId) {
      setStatus("error");
      setMessage("This invitation link is missing required information.");
      return;
    }
    inviteApi
      .acceptInstitutionMemberInvite({ token, org_id: orgId })
      .then((result) => {
        setStatus("success");
        setMessage(result.message);
      })
      .catch((err: Error) => {
        setStatus("error");
        setMessage(err.message || "This invitation link is invalid or has expired.");
      });
  }, [token, orgId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src="/globalyapp-logo.png" alt="Globalyapp" width={727} height={157} className="h-10 w-auto" />
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
              {status === "loading" && "Setting up your account…"}
              {status === "success" && "Invitation accepted!"}
              {status === "error" && "Invitation link invalid"}
            </CardTitle>
            {status !== "loading" && <CardDescription>{message}</CardDescription>}
          </CardHeader>
          {status !== "loading" && (
            <CardContent>
              <Button className="h-10 w-full cursor-pointer" onClick={() => router.push("/auth/sign-in")}>
                Continue to Sign In
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
