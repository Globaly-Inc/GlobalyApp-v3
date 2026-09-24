import { BadgeCheck } from "lucide-react";

/**
 * The trust tick that sits beside a listing's name, in place of a written "Verified" badge.
 *
 * One component so the rule lives once: a listing earns the tick when an admin has verified it
 * OR its owner has claimed it. Callers that only hold a boolean pass
 * `status={verified ? "verified" : null}`.
 */
export function VerifiedTick({
  status, claimStatus, className = "h-4 w-4",
}: Readonly<{ status?: string | null; claimStatus?: string | null; className?: string }>) {
  const verified = status === "verified";
  if (!verified && claimStatus !== "claimed") return null;

  return (
    <BadgeCheck
      className={`${className} shrink-0 text-sky-500`}
      aria-label={verified ? "Verified" : "Claimed"}
    />
  );
}
