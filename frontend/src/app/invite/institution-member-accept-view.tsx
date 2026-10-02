"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inviteApi } from "./apis";
import { LOGO } from "@/lib/public-assets";

type Status = "loading" | "success" | "error";

export function InstitutionMemberAcceptInviteView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const orgId = searchParams.get("org_id");
  const linkInvalid = !token || !orgId;
  const [result, setResult] = useState<{ status: Status; message: string }>({ status: "loading", message: "" });
  const { status, message } = linkInvalid
    ? { status: "error" as const, message: "This invitation link is missing required information." }
    : result;

  const requestedRef = useRef(false);
  useEffect(() => {
    if (requestedRef.current || !token || !orgId) return;
    requestedRef.current = true;
    inviteApi
      .acceptInstitutionMemberInvite({ token, org_id: orgId })
      .then((res) => {
        setResult({ status: "success", message: res.message });
      })
      .catch((err: Error) => {
        setResult({ status: "error", message: err.message || "This invitation link is invalid or has expired." });
      });
  }, [token, orgId]);

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
