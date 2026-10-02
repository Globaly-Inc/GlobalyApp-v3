// The plaintext OTP is a bearer credential. It is logged in dev so local sign-in works
// without a mail provider, and MUST be absent from production logs.
// Asserts on the real emitted log line, in a child process, because NODE_ENV and the
// logger are both read at import time.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * The account this sends to.
 *
 * It used to default to a real colleague's address, which meant the test only passed on a
 * database that happened to contain that person — and failed with "Account not found" everywhere
 * else, looking like a redaction bug when nothing was wrong with the redaction. Per the house
 * rule for DB tests, it now OWNS its fixture: a disposable account created before the children
 * run and deleted by exact id afterwards, whatever the outcome.
 *
 * OTP_TEST_EMAIL still overrides, for pointing it at a real account deliberately.
 */
const OWNED = !process.env.OTP_TEST_EMAIL;
const EMAIL = process.env.OTP_TEST_EMAIL ?? "otp-redaction-fixture@globalyhub.invalid";
const SELF = fileURLToPath(import.meta.url);

// Child mode: send one OTP so the parent can inspect the log line.
if (process.env.OTP_REDACTION_CHILD) {
  const { sendOtp } = await import("../src/modules/auth/auth.service.js");
  await sendOtp(EMAIL);
  process.exit(0);
}

function otpSentLine(nodeEnv: string): string {
  const run = spawnSync(process.execPath, ["--import", "tsx", SELF], {
    encoding: "utf-8",
    env: { ...process.env, NODE_ENV: nodeEnv, OTP_REDACTION_CHILD: "1", OTP_TEST_EMAIL: EMAIL },
  });
  const out = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, `child failed under NODE_ENV=${nodeEnv}:\n${out}`);
  const line = out.split("\n").find((l) => l.includes("OTP sent"));
  assert.ok(line, `no "OTP sent" log emitted under NODE_ENV=${nodeEnv}:\n${out}`);
  return line;
}

// ── Fixture ──────────────────────────────────────────────────────────────────
// `.invalid` is reserved by RFC 2606 and can never resolve, so the queued mail has nowhere to go
// even if a worker picks it up.
const { masterKnex } = await import("../src/core/db/master-pool.js");
let fixtureId: number | null = null;

async function createFixture(): Promise<void> {
  if (!OWNED) return;
  await masterKnex("platform_users").where({ email: EMAIL }).del(); // a previous aborted run
  const [row] = await masterKnex("platform_users")
    .insert({ first_name: "OTP", last_name: "Fixture", email: EMAIL, account_status: 1, is_email_verified: true })
    .returning("id");
  fixtureId = Number(typeof row === "object" ? row.id : row);
}

/** By exact id, never by pattern — and the challenge rows this created go with it. */
async function dropFixture(): Promise<void> {
  if (!OWNED || fixtureId == null) return;
  await masterKnex("auth_otp_challenges").where({ email: EMAIL }).del().catch(() => {});
  await masterKnex("platform_users").where({ id: fixtureId }).del();
}

try {
  await createFixture();

  const prod = otpSentLine("production");
  assert.ok(!/"otp"/.test(prod), `production log leaks the OTP: ${prod}`);
  assert.ok(/userId/.test(prod), `production log lost its userId context: ${prod}`);

  const dev = otpSentLine("development");
  assert.ok(/"otp":"\d{6}"/.test(dev), `dev log should carry the OTP for local sign-in: ${dev}`);

  console.log("otp-log-redaction: all checks passed");
} finally {
  // In a finally so a failed assertion still takes the fixture with it.
  await dropFixture();
  await masterKnex.destroy().catch(() => {});
}
