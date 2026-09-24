/**
 * A 204 carries no body, so `res.json()` on one throws "Unexpected end of JSON input" — a failure
 * the caller sees as a broken request even though the write succeeded. Every endpoint that answers
 * "done, nothing to say" lands here: PATCH a thread member's role, mark-read, and friends.
 *
 * Callers expecting nothing back type T as void and get undefined; everyone else is unaffected.
 *
 * Its own module, not a private function in http.ts, for one reason: http.ts imports
 * `@/lib/session` on its first line, and the `@/` alias is a bundler concern that bare node cannot
 * resolve — so self-check.ts could not import it. Nothing here imports anything.
 */
export async function parseBody<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  return res.json() as Promise<T>;
}
