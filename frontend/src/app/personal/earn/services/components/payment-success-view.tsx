"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppDispatch } from "@/lib/hooks";
import { verifyPayment } from "../store/my-services-slice";

type State =
  | { phase: "verifying" }
  | { phase: "success"; orderId: number }
  | { phase: "error"; message: string };

export function PaymentSuccessView() {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  // A missing session id is knowable at first render, so it is initial state rather than something an effect
  // discovers and then corrects.
  const [state, setState] = useState<State>(() =>
    sessionId ? { phase: "verifying" } : { phase: "error", message: "No session ID found." },
  );

  /**
   * Fire verification exactly once per mount.
   *
   * A ref guard, not a dependency list: React re-runs effects in development's double-invoked StrictMode, and
   * this endpoint settles money. The server is idempotent — a replay returns already_verified rather than
   * counting the order twice — but the client should not lean on that to avoid a duplicate request.
   */
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !sessionId) return;
    fired.current = true;

    dispatch(verifyPayment(sessionId)).then((result) => {
      if (verifyPayment.fulfilled.match(result)) {
        // already_verified is a success, not a failure — this is what makes a reload safe.
        setState({ phase: "success", orderId: result.payload.order_id });
        return;
      }
      setState({
        phase: "error",
        message: result.error.message ?? "We couldn't confirm this payment.",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md items-center justify-center py-10">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          {state.phase === "verifying" && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verifying your payment…</p>
            </>
          )}

          {state.phase === "success" && (
            <>
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
              <h2 className="text-xl font-bold text-foreground">Payment Successful!</h2>
              {/* States plainly what happens next. It does not claim the provider has been paid. */}
              <p className="text-sm text-muted-foreground">
                Your payment is held until both you and the provider confirm the service is complete. The
                provider has been notified.
              </p>
              <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
                {state.orderId > 0 && (
                  <Button
                    className="flex-1"
                    render={<Link href={`/personal/earn/services/orders/${state.orderId}`}>View Order</Link>}
                  />
                )}
                <Button
                  variant="outline"
                  className="flex-1"
                  render={<Link href="/personal/earn/services">My Services</Link>}
                />
              </div>
            </>
          )}

          {state.phase === "error" && (
            <>
              <AlertCircle className="h-10 w-10 text-destructive" />
              <h2 className="text-xl font-bold text-foreground">Payment verification failed</h2>
              {/* The specific reason, not a generic apology — the server names the mismatch it found. */}
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <p className="text-xs text-muted-foreground">
                If you were charged, nothing has been lost — the order is unchanged and our team can reconcile
                it.
              </p>
              <Button
                variant="outline"
                className="mt-2"
                render={<Link href="/personal/earn/services">Back to Services</Link>}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
