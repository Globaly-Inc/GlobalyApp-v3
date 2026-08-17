// Captures the emails auth publishes to the "emails" queue so tests can read the
// OTP the way a real user would — from the message — instead of reaching into
// the hashing internals.
//
// Usage (must be in the test file itself, vi.mock is not hoisted across modules):
//
//   const { published } = vi.hoisted(() => ({ published: [] as PublishedEmail[] }));
//   vi.mock("../../src/shared/queue/queueService.js", () => ({
//     queueService: { publish: async (queue: string, message: unknown) => {
//       published.push({ queue, message } as never);
//     } },
//     default: {},
//   }));

export interface PublishedEmail {
  queue: string;
  message: { to: string; subject: string; html: string };
}

const OTP_PATTERN = /<strong>(\d{6})<\/strong>/;

/**
 * Wait for an OTP email addressed to `email` and return the 6-digit code from it.
 * Uses real wall-clock polling so it works under a faked Date.
 */
export async function waitForOtp(
  published: PublishedEmail[],
  email: string,
  timeoutMs = 5000,
): Promise<string> {
  // performance.now() is not faked by vi.useFakeTimers({ toFake: ["Date"] }).
  const deadline = performance.now() + timeoutMs;
  const seen = new Set<PublishedEmail>();

  for (;;) {
    for (let i = published.length - 1; i >= 0; i--) {
      const entry = published[i];
      if (seen.has(entry)) continue;
      seen.add(entry);
      if (entry.queue !== "emails") continue;
      if (entry.message?.to !== email) continue;
      const match = OTP_PATTERN.exec(entry.message.html ?? "");
      if (match) return match[1];
    }
    if (performance.now() > deadline) {
      throw new Error(
        `No OTP email for ${email} within ${timeoutMs}ms. Captured: ${JSON.stringify(
          published.map((p) => ({ to: p.message?.to, subject: p.message?.subject })),
        )}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** A 6-digit code guaranteed to differ from `otp`. */
export function wrongOtp(otp: string): string {
  return otp === "000000" ? "111111" : "000000";
}
