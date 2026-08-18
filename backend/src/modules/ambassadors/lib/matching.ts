// Pure matching helpers — no database, no clock, so they are directly unit
// testable. Behavioural spec: V1 `process-ambassador-timeout`.

export interface MatchCandidate {
  id: number;
  user_id: number;
  country_of_origin: string | null;
  avg_rating: number;
}

/**
 * V1's reroute choice, verbatim: take the online candidates ordered by rating
 * descending, then prefer the first whose country matches the prospect's.
 *
 * Note this is "country match wins over rating", not a weighted score — the
 * original loops the rating-ordered list and breaks on the first country hit.
 * Reproduced rather than improved, because the ranking is the spec.
 */
export function pickNextAmbassador(
  candidates: readonly MatchCandidate[],
  prospectCountry: string | null,
): MatchCandidate | null {
  if (candidates.length === 0) return null;
  if (prospectCountry) {
    const sameCountry = candidates.find((c) => c.country_of_origin === prospectCountry);
    if (sameCountry) return sameCountry;
  }
  return candidates[0]!;
}

/** Net payable after the platform's cut, rounded down to whole minor units. */
export function netAmountMinor(grossMinor: number, commissionPercent: number): number {
  if (grossMinor <= 0) return 0;
  const net = Math.floor(grossMinor * (1 - commissionPercent / 100));
  return net < 0 ? 0 : net;
}
