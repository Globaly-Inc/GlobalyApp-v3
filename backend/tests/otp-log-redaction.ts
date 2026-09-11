// The plaintext OTP is a bearer credential. It is logged in dev so local sign-in works
// without a mail provider, and MUST be absent from production logs.
// Asserts on the real emitted log line, in a child process, because NODE_ENV and the
// logger are both read at import time.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const EMAIL = process.env.OTP_TEST_EMAIL ?? "wonjala.joshi@globalyhub.com";
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

const prod = otpSentLine("production");
assert.ok(!/"otp"/.test(prod), `production log leaks the OTP: ${prod}`);
assert.ok(/userId/.test(prod), `production log lost its userId context: ${prod}`);

const dev = otpSentLine("development");
assert.ok(/"otp":"\d{6}"/.test(dev), `dev log should carry the OTP for local sign-in: ${dev}`);

console.log("otp-log-redaction: all checks passed");
