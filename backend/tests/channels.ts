// Pure checks for the omnichannel (Zernio) rules — no database, no network.
// Run with: npm run test:channels

import { createHmac } from "node:crypto";

// Config is parsed at import, so the env must be set first.
process.env.ZERNIO_WEBHOOK_SECRET = "test-secret";
process.env.NODE_ENV = "production";
const { verifySignature } = await import("../src/modules/channels/lib/zernio-client.js");
const { windowOpen } = await import("../src/modules/channels/services/outbound.service.js");
const { aiConfigOf, DEFAULT_AI_CONFIG, channelVisitorKey, isChannel } = await import("../src/modules/channels/consts.js");
const { formatForChannel, markdownToChannel } = await import("../src/modules/channels/lib/channel-format.js");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name}`); }
}

// --- webhook signature: hex HMAC-SHA256 of the RAW body
const body = Buffer.from(JSON.stringify({ id: "evt_1", event: "message.received" }));
const good = createHmac("sha256", "test-secret").update(body).digest("hex");
check("a correctly signed body is accepted", verifySignature(body, good));
check("upper-case hex is accepted (case-insensitive)", verifySignature(body, good.toUpperCase()));
check("a missing signature is rejected", !verifySignature(body, undefined));
check("a signature for different bytes is rejected", !verifySignature(Buffer.from(body.toString() + " "), good));
check("a signature with the wrong secret is rejected", !verifySignature(body, createHmac("sha256", "other").update(body).digest("hex")));
check("a truncated signature is rejected (no length leak via throw)", !verifySignature(body, good.slice(0, 10)));

// --- WhatsApp's 24-hour window
const row = (channel: string, minutesAgo: number | null) => ({
  channel, last_inbound_at: minutesAgo == null ? null : new Date(Date.now() - minutesAgo * 60_000),
}) as unknown as Parameters<typeof windowOpen>[0];
check("WhatsApp: open 23h after the customer's last message", windowOpen(row("whatsapp", 23 * 60)));
check("WhatsApp: closed 25h after", !windowOpen(row("whatsapp", 25 * 60)));
check("WhatsApp: closed when the customer never wrote", !windowOpen(row("whatsapp", null)));
check("Instagram is never blocked by the WhatsApp window", windowOpen(row("instagram", 48 * 60)));

// --- AI config defaults
check("an empty stored config gets every default", JSON.stringify(aiConfigOf({})) === JSON.stringify(DEFAULT_AI_CONFIG));
check("a stored false is kept", aiConfigOf({ escalation: { sensitive: false } }).escalation.sensitive === false);
check("and the keys it didn't mention keep their defaults", aiConfigOf({ escalation: { sensitive: false } }).escalation.human === true);
check("garbage reads as defaults", aiConfigOf("nonsense").takeover === true);

// --- keys and guards
check("channel visitor keys are namespaced so they never collide with widget fingerprints", channelVisitorKey("abc") === "zernio:abc");
check("isChannel accepts the three Zernio channels", ["whatsapp", "instagram", "facebook"].every(isChannel));
check("isChannel rejects ai_embed and other platforms", !isChannel("ai_embed") && !isChannel("telegram"));

// --- the widget's answer, formatted for each app
const md = "Here is how they compare:\n\n- **Master of Science**: research-focused\n- **MEng**: *industry* path\n\n## Next steps\nApply [online](https://x.edu/apply).";
const wa = markdownToChannel(md, "whatsapp");
const ig = markdownToChannel(md, "instagram");
check("WhatsApp keeps bold as *x* and bullets as •", wa.includes("• *Master of Science*: research-focused") && wa.includes("_industry_"));
check("WhatsApp turns a heading into a bold line", wa.includes("*Next steps*"));
check("Instagram gets no markup at all, just • bullets", ig.includes("• Master of Science: research-focused") && !/[*_#]/.test(ig.replace("https://x.edu/apply", "")));
// Whole-line equality, not a substring search, for anything holding a URL (CodeQL's
// incomplete-URL-sanitization rule flags `.includes("https://…")`, even in a test).
const hasLine = (text: string, line: string) => text.split("\n").some((l) => l.trim() === line);
check("links keep their URL as text", hasLine(ig, "Apply online: https://x.edu/apply."));
const card = { id: "1", name: "MEng in Computer Science", institution: "Cornell", degree_level: "Master", duration: "1 year", city: "Ithaca", source_url: "https://x.edu/meng" };
const withCards = formatForChannel({ cleanText: "Two options:", cards: [card], blocks: [{ type: "timeline", title: "How to apply", steps: [{ title: "Submit transcripts" }, { title: "Interview" }] }] }, "whatsapp");
check("course cards become bulleted lines with their details", withCards.includes("• *MEng in Computer Science*") && hasLine(withCards, "Master · 1 year · Ithaca") && hasLine(withCards, "https://x.edu/meng"));
check("a timeline block becomes a numbered list", withCards.includes("*How to apply*\n1. Submit transcripts\n2. Interview"));
const long = formatForChannel({ cleanText: ("A paragraph of text. ".repeat(20) + "\n\n").repeat(5), cards: [card], blocks: [] }, "instagram");
check("Instagram replies stay under its 1000-character limit", long.length <= 1000);

console.log(`\nchannels: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
