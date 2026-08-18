// Where a consent record's IP address and user agent come from: the connection,
// never the request body. Pure, so every fallback is unit-testable without a
// server — which is the point, because these branches only fire behind a proxy or
// against a client that sends no User-Agent, and an integration test cannot
// reproduce either honestly.
//
// V1 declared `scribe_consent_log.ip_address inet` and never wrote it, so no V1
// consent row can say where its consent came from.

/** Bounded, so a hostile header cannot grow the legal record without limit. */
export const MAX_IP_CHARS = 200;
export const MAX_USER_AGENT_CHARS = 500;

export interface ConsentEvidence {
  ip_address: string | null;
  user_agent: string | null;
}

/**
 * `x-forwarded-for` is a comma-separated chain and the client is the FIRST hop.
 * Fastify hands the header over as an array when it repeats. Falls back to the
 * socket address, then to null — a missing value is recorded as missing, never as
 * an empty string that reads like a real one.
 */
export function consentEvidence(
  headers: Record<string, string | string[] | undefined>,
  socketIp: string | undefined,
): ConsentEvidence {
  const forwarded = headers["x-forwarded-for"];
  const chain = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const claimed = chain?.split(",")[0]?.trim();

  const ua = headers["user-agent"];
  const userAgent = Array.isArray(ua) ? ua[0] : ua;

  return {
    ip_address: (claimed || socketIp || "").slice(0, MAX_IP_CHARS) || null,
    user_agent: (userAgent || "").slice(0, MAX_USER_AGENT_CHARS) || null,
  };
}
