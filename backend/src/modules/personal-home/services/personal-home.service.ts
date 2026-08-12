// Personal Home aggregator. Owns no tables and no repositories of its own — it composes the domain
// services the Home surface displays.
//
// allSettled, not all: one failing domain must degrade one card, not take the page down. Failed sources are
// named in `degraded` so the client can show that card's retry affordance instead of a wrong zero.

import { createChildLogger } from "../../../shared/logger.js";
import { computeCompletion } from "../../platform-users/services/profile-completion.service.js";
import * as membershipsService from "../../platform-users/services/memberships.service.js";
import * as enquiriesRepo from "../../enquiries/repositories/enquiries.repository.js";
import * as favoritesRepo from "../../favorites/repositories/favorites.repository.js";

const logger = createChildLogger("personal-home");

export async function getSummary(userId: number) {
  const [completion, enquiries, favorites, invites, positions] = await Promise.allSettled([
    computeCompletion(userId),
    enquiriesRepo.summaryForUser(userId),
    favoritesRepo.countForUser(userId),
    membershipsService.listPendingInvites(userId),
    membershipsService.listPositionUpdates(userId),
  ]);

  const degraded: string[] = [];
  const note = (key: string, result: PromiseSettledResult<unknown>) => {
    if (result.status === "rejected") {
      degraded.push(key);
      logger.warn("Home summary source failed", {
        source: key,
        userId,
        err: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  };
  note("completion", completion);
  note("enquiries", enquiries);
  note("favorites", favorites);
  note("invites", invites);
  note("positions", positions);

  const enquiryData = enquiries.status === "fulfilled" ? enquiries.value : { total: 0, recent: [] };

  return {
    // A degraded completion falls back to 0 AND is listed in `degraded`, so the UI shows an error state
    // rather than telling the user their profile is 0% complete.
    completion: completion.status === "fulfilled" ? completion.value : { percentage: 0, badges: [] },
    enquiries_count: enquiryData.total,
    recent_enquiries: enquiryData.recent,
    favorites_count: favorites.status === "fulfilled" ? favorites.value : 0,
    pending_invites: invites.status === "fulfilled" ? invites.value : [],
    position_updates: positions.status === "fulfilled" ? positions.value : [],
    degraded,
  };
}
