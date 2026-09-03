import type { MentionCandidate } from "../apis/types";

/**
 * Business-portal-only: the feed itself is shared with the Personal Home, which has no business
 * membership to mention. Dynamic import + swallow-on-failure keeps that context optional instead
 * of making the shared feed module hard-depend on a business feature.
 */
export async function fetchMentionCandidates(search?: string): Promise<MentionCandidate[]> {
  try {
    const { businessProfileDetailApi } = await import("@/app/business/profile/apis");
    const { data } = await businessProfileDetailApi.getMembers({ limit: 10, search });
    return data.map((m) => ({
      platform_user_id: m.platform_user_id,
      first_name: m.first_name,
      last_name: m.last_name,
      photo_url: m.photo_url,
    }));
  } catch {
    return [];
  }
}

export function mentionDisplayName(m: { first_name: string | null; last_name: string | null }): string {
  return `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Someone";
}
