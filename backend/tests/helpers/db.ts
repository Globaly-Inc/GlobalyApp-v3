// Integration-test DB helpers.

export const dbAvailable =
  (globalThis as Record<string, unknown>).__TEST_DB_AVAILABLE__ === true;

let counter = 0;

/** Unique email per call so tests never collide on the unique email index. */
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}.${process.pid}.${Date.now()}.${counter}@vitest.local`;
}
