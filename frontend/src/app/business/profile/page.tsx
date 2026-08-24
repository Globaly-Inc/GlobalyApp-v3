"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthState } from "@/app/auth/store/auth-slice";

export default function BusinessProfileResolverPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, initializing } = useAuthState();

  useEffect(() => {
    if (initializing || !user) return;
    const target = user.businesses.find((b) => b.org_id === user.orgId) ?? user.businesses[0];
    const query = searchParams.toString();
    if (target) router.replace(`/business/profile/${target.id}${query ? `?${query}` : ""}`);
    else router.replace("/business/portal");
  }, [initializing, user, router, searchParams]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
