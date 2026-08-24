"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  clearCheckoutError,
  clearPortalError,
  fetchPlans,
  fetchSubscription,
  openBillingPortal,
  startCheckout,
} from "../store/business-billing-slice";
import { PlanCard } from "./plan-card";
import { SubscriptionSummary } from "./subscription-summary";

export function BillingView() {
  const dispatch = useAppDispatch();
  const { plans, subscription, status, error, checkingOutPlan, checkoutError, openingPortal, portalError } =
    useAppSelector((s) => s.businessBilling);

  // Ref guard per AGENTS.md — Strict Mode double-invokes effects on mount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchPlans());
    dispatch(fetchSubscription());
  }, [dispatch]);

  const handleSubscribe = async (planCode: string) => {
    const result = await dispatch(startCheckout(planCode));
    if (startCheckout.fulfilled.match(result)) {
      if (result.payload.url) {
        window.location.assign(result.payload.url);
      } else {
        // Mock driver activates the plan immediately with no redirect target.
        dispatch(fetchSubscription());
      }
    }
  };

  const handleManageBilling = async () => {
    const result = await dispatch(openBillingPortal());
    if (openBillingPortal.fulfilled.match(result) && result.payload.url) {
      window.location.assign(result.payload.url);
    }
  };

  const loading = status === "loading" && plans.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">Manage your subscription plan and credit balance.</p>
      </div>

      <SubscriptionSummary
        subscription={subscription}
        openingPortal={openingPortal}
        onManageBilling={handleManageBilling}
      />

      {portalError && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive">{portalError}</p>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => dispatch(clearPortalError())}>
            Dismiss
          </Button>
        </div>
      )}

      {checkoutError && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive">{checkoutError}</p>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => dispatch(clearCheckoutError())}>
            Dismiss
          </Button>
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load plans"}</p>
          <Button variant="link" size="sm" className="px-0" onClick={() => dispatch(fetchPlans())}>
            Try again
          </Button>
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}

      {!loading && plans.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              isCurrent={subscription?.plan_code === plan.code}
              busy={checkingOutPlan === plan.code}
              onSubscribe={() => handleSubscribe(plan.code)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
