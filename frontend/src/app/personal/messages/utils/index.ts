import { getAccessToken } from "@/lib/session";

/**
 * The signed-in platform user's id, read from the access token's `sub`.
 *
 * /auth/me returns no numeric id, and the thread only needs this to decide which side of
 * the bubble a message sits on — a display concern. Every ownership decision that matters
 * is made server-side from the same claim.
 */
export function currentUserId(): number | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const { sub } = JSON.parse(atob(token.split(".")[1] ?? "")) as { sub?: string };
    return Number(sub) || null;
  } catch {
    return null;
  }
}
