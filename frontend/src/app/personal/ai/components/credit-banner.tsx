"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Coins } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchCreditBalance } from "../store/ai-chat-slice";
import Link from "next/link";

export function CreditBanner() {
  const dispatch = useAppDispatch();
  const credits = useAppSelector((s) => s.aiChat.credits);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchCreditBalance());
  }, [dispatch]);

  if (!credits || credits.total > 3) return null;

  if (credits.total === 0) {
    return (
      <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span>You&apos;ve used all your credits.</span>
        <Link href="/personal/credits" className="ml-auto shrink-0 text-xs font-medium text-primary hover:underline">
          Purchase more
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
      <Coins className="h-4 w-4 shrink-0 text-amber-600" />
      <span>{credits.total} credit{credits.total !== 1 ? "s" : ""} remaining</span>
    </div>
  );
}
