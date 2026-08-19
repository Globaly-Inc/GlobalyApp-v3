// Pure decisions the dashboard makes about what to show. Tested directly —
// see frontend/tests/unit/business-dashboard-utils.test.ts.

import type { InboxItem } from "@/app/business/enquiries/apis/types";
import { LOW_CREDIT_THRESHOLD } from "../const";

export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Null rather than "" when there is no usable name: the hero renders
 * `Good morning, {name}` and an empty string leaves a dangling comma.
 */
export function memberFirstName(member: { first_name: string | null; last_name: string | null }): string | null {
  const first = member.first_name?.trim();
  return first ? first : null;
}

export function isCreditBalanceLow(balance: number): boolean {
  return balance < LOW_CREDIT_THRESHOLD;
}

/** `businesses.status` — the one value that means "an admin has not looked yet". */
export function needsVerification(status: string): boolean {
  return status === "pending";
}

/** A real zero renders as "0". Never a dash, never a blank — see the empty states. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/**
 * What one recent lead's line reads.
 *
 * The locked branch uses the server's own 140-character preview and nothing
 * else; there is no client-side path from a locked lead to a message, because
 * the server omits the key entirely.
 */
export function leadHeadline(lead: InboxItem): string {
  if (lead.unlocked) return lead.message.trim() || "No message";
  return lead.message_preview.trim() || "Locked — unlock to read";
}
