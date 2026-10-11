"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Coins } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchCreditBalance } from "../store/ai-chat-slice";
import { useAuthState } from "@/app/auth/store/auth-slice";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";

export function CreditBanner() {
  const dispatch = useAppDispatch();
  const credits = useAppSelector((s) => s.aiChat.credits);
  const { user } = useAuthState();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchCreditBalance());
  }, [dispatch, user]);

  if (!credits || credits.total > 3) return null;

  if (credits.total === 0) {
    return (
      <Alert variant="destructive" className="mx-4 mt-2 w-auto py-2">
        <AlertTriangle />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>You&apos;ve used all your credits.</span>
          <Link href="/personal/credits" className="ml-auto shrink-0 text-xs font-medium text-primary hover:underline">
            Purchase more
          </Link>
        </div>
      </Alert>
    );
  }

  return (
    <Alert variant="warning" role="status" className="mx-4 mt-2 w-auto py-2">
      <Coins />
      <span>{credits.total} credit{credits.total !== 1 ? "s" : ""} remaining</span>
    </Alert>
  );
}
