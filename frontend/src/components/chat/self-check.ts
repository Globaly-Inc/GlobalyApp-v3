/**
 * Self-check for the chat feature's pure logic — the parts with real branching:
 * the composer's markdown toolbar, the message-body parser, sender grouping, and the
 * copy-complete-chat serialiser.
 *
 * Run: node --experimental-strip-types src/components/chat/self-check.ts
 * (from `frontend/`). No test framework — these are `assert`s, and node runs the TS.
 */

import assert from "node:assert/strict";
import { createChatSlice, type ChatApi, type ChatState } from "./create-chat-slice.ts";
import { applyFormat, parseMessageBody, truncateUrl } from "./markdown.ts";
import {
  conversationToText,
  fileExtension,
  formatFileSize,
  isGroupedWith,
  isThreadEvent,
  isImageFile,
  isPdfFile,
  isVideoFile,
  previewText,
  threadAvatar,
  threadTitle,
} from "./utils.ts";
import { getRecentEmojis, searchEmojis } from "./emojis.ts";
import type { ChatThread, EnquiryMessage } from "./types";

const msg = (over: Partial<EnquiryMessage> & { id: number }): EnquiryMessage => ({
  body: "hi",
  created_at: "2026-08-23T10:00:00.000Z",
  sender_id: 1,
  sender_name: "Ada",
  sender_avatar: null,
  is_mine: false,
  sender_role: "business",
  is_starred: false,
  is_pinned: false,
  attachments: [],
  reply_to_id: null,
  reply_count: 0,
  reactions: [],
  edited_at: null,
  kind: "message",
  ...over,
});

// ── applyFormat ──

// Wrapping a selection keeps the selection over the wrapped text.
assert.deepEqual(applyFormat("hello world", 0, 5, "bold"), {
  text: "**hello** world",
  selectionStart: 2,
  selectionEnd: 7,
});

// With nothing selected the caret lands between the tokens so typing is formatted.
assert.deepEqual(applyFormat("", 0, 0, "italic"), { text: "__", selectionStart: 1, selectionEnd: 1 });

assert.equal(applyFormat("x", 0, 1, "strikethrough").text, "~~x~~");
assert.equal(applyFormat("x", 0, 1, "code").text, "`x`");

// Lists prefix every selected line, and number from one.
assert.equal(applyFormat("a\nb", 0, 3, "numbered").text, "1. a\n2. b");
assert.equal(applyFormat("a\nb", 0, 3, "bullet").text, "• a\n• b");
assert.equal(applyFormat("", 0, 0, "bullet").text, "• ");

// The link caret lands on `url`, ready to be typed over.
{
  const r = applyFormat("Globaly", 0, 7, "link");
  assert.equal(r.text, "[Globaly](url)");
  assert.equal(r.text.slice(r.selectionStart, r.selectionEnd), "url");
}

// ── parseMessageBody ──

assert.deepEqual(parseMessageBody("**bold**"), [{ kind: "strong", value: "bold" }]);
assert.deepEqual(parseMessageBody("~~gone~~"), [{ kind: "del", value: "gone" }]);
assert.deepEqual(parseMessageBody("_it_"), [{ kind: "em", value: "it" }]);

// Bold must not be shredded into two italics by the single-token rule.
assert.deepEqual(parseMessageBody("a **b** c"), [
  { kind: "text", value: "a " },
  { kind: "strong", value: "b" },
  { kind: "text", value: " c" },
]);

// Underscores inside a word are not emphasis — `some_variable_name` stays literal.
assert.deepEqual(parseMessageBody("some_variable_name"), [{ kind: "text", value: "some_variable_name" }]);

// Code spans are taken first, so nothing inside backticks is reinterpreted.
assert.deepEqual(parseMessageBody("run `a **b**` now"), [
  { kind: "text", value: "run " },
  { kind: "code", value: "a **b**" },
  { kind: "text", value: " now" },
]);

// A bare URL becomes a link, with the trailing sentence punctuation left outside it.
{
  const parsed = parseMessageBody("see https://globalyapp.com/courses, thanks");
  assert.deepEqual(parsed[1], { kind: "link", href: "https://globalyapp.com/courses", label: "globalyapp.com/courses" });
  assert.deepEqual(parsed[2], { kind: "text", value: ", thanks" });
}

// `www.` links get a protocol so the href is navigable.
assert.equal((parseMessageBody("www.globalyapp.com")[0] as { href: string }).href, "https://www.globalyapp.com");

// Nothing is ever emitted as HTML — the renderer only ever sees known segment kinds.
for (const segment of parseMessageBody("<script>alert(1)</script> **x**")) {
  assert.ok(["text", "code", "link", "strong", "em", "del"].includes(segment.kind));
}
assert.deepEqual(parseMessageBody("<b>x</b>"), [{ kind: "text", value: "<b>x</b>" }]);

assert.equal(truncateUrl("https://globalyapp.com/a/very/long/path/that/keeps/going/and/going/on", 20), "globalyapp.com/a/...");

// ── grouping ──

const at = (iso: string, id: number, sender = 1) => msg({ id, sender_id: sender, created_at: iso });
assert.equal(isGroupedWith(at("2026-08-23T10:00:00Z", 1), undefined), false, "first message never groups");
assert.equal(isGroupedWith(at("2026-08-23T10:04:00Z", 2), at("2026-08-23T10:00:00Z", 1)), true, "same sender, 4 min");
assert.equal(isGroupedWith(at("2026-08-23T10:06:00Z", 2), at("2026-08-23T10:00:00Z", 1)), false, "6 min breaks it");
assert.equal(
  isGroupedWith(at("2026-08-23T10:01:00Z", 2, 9), at("2026-08-23T10:00:00Z", 1, 1)),
  false,
  "different sender never groups",
);
// A thread event carries the acting admin's sender_id, so without the kind guard the message they
// send straight afterwards would group onto the event and lose its avatar and header.
{
  const event = msg({ id: 1, kind: "member_added", body: "Bo was invited by Ada" });
  const after = msg({ id: 2, created_at: "2026-08-23T10:01:00.000Z" });
  assert.equal(isGroupedWith(after, event), false, "a message never groups onto a thread event");
  assert.equal(isGroupedWith(event, msg({ id: 0 })), false, "a thread event never groups onto a message");
  // Every verb is an event; only a typed message is not.
  assert.equal(isThreadEvent("message"), false);
  for (const k of ["member_added", "member_removed", "member_left", "admin_granted", "admin_revoked", "renamed", "photo_changed"] as const) {
    assert.equal(isThreadEvent(k), true, `${k} renders as a pill`);
  }
}

// ── thread name ──
//
// One admin-given name shown to everyone on the thread, falling back to each side's own counterpart
// when nobody has named it. Whitespace counts as unnamed — an all-spaces title would otherwise
// render as a blank heading.
assert.equal(threadTitle({ title: "Sharma — Feb intake", counterpart_name: "Aarav" }), "Sharma — Feb intake");
assert.equal(threadTitle({ title: null, counterpart_name: "Aarav" }), "Aarav", "unnamed falls back");
assert.equal(threadTitle({ title: "   ", counterpart_name: "Aarav" }), "Aarav", "whitespace is not a name");

// Same rule for the picture: the admin's wins, the counterpart's is the fallback, and a thread with
// neither renders initials rather than a broken <img>.
assert.equal(threadAvatar({ thread_photo: "/t.png", counterpart_avatar: "/c.png" }), "/t.png");
assert.equal(threadAvatar({ thread_photo: null, counterpart_avatar: "/c.png" }), "/c.png", "falls back");
assert.equal(threadAvatar({ thread_photo: null, counterpart_avatar: null }), null, "neither is null, not ''");

// ── previews ──

assert.equal(previewText("**Hi**  there\n\n• one"), "Hi there one");

// ── copy complete chat ──

{
  const text = conversationToText(
    { title: null, counterpart_name: "Sydney Study Agents", course_name: "BSc Computer Science" },
    [
      msg({ id: 1, body: "Hello!", sender_name: "Agent", created_at: "2026-08-21T02:30:00.000Z" }),
      msg({ id: 2, body: "Hi back", sender_name: "Student", created_at: "2026-08-21T02:31:00.000Z" }),
    ],
  );
  assert.ok(text.startsWith("Conversation with Sydney Study Agents\nCourse: BSc Computer Science"));
  // Sender, order and content are all present…
  assert.ok(text.indexOf("Agent") < text.indexOf("Student"), "messages keep their order");
  assert.ok(text.includes("Hello!") && text.includes("Hi back"));
  // …and internal metadata is not.
  for (const leaked of ["distribution", "sender_id", "is_mine", "sender_role", "is_starred"]) {
    assert.ok(!text.includes(leaked), `${leaked} must not be copied`);
  }
  // One date heading for two same-day messages, not two.
  assert.equal(text.split("—").length - 1, 2, "a single date heading, opened and closed");
}

// ── attachments ──

assert.equal(formatFileSize(0), "0 KB", "no size renders as 0, not NaN");
assert.equal(formatFileSize(-5), "0 KB", "a negative size cannot render as a negative file");
// Sub-kilobyte rounds up rather than reading as "0.4 KB".
assert.equal(formatFileSize(400), "1 KB");
assert.equal(formatFileSize(512 * 1024), "512 KB");
assert.equal(formatFileSize(1024 * 1024), "1 MB", "an exact megabyte drops the .0");
assert.equal(formatFileSize(1.4 * 1024 * 1024), "1.4 MB");
assert.equal(formatFileSize(20 * 1024 * 1024), "20 MB", "past 10 units there is no decimal");
assert.equal(formatFileSize(3 * 1024 ** 3), "3 GB", "and it stops at GB rather than running off the unit list");

assert.ok(isImageFile("image/png") && !isImageFile("video/mp4"));
assert.ok(isVideoFile("video/quicktime") && !isVideoFile("image/gif"));
// A PDF with a generic or missing MIME is still a PDF by extension.
assert.ok(isPdfFile("application/pdf"));
assert.ok(isPdfFile("application/octet-stream", "offer-letter.PDF"), "extension is the fallback, case-insensitively");
assert.ok(!isPdfFile("text/plain", "notes.txt"));

assert.equal(fileExtension("transcript.docx"), "DOCX");
assert.equal(fileExtension("noextension"), "NOEXTENSION");

// ── emoji search ──

assert.ok(searchEmojis("thumbs").includes("\u{1F44D}"), "keyword search finds by name");
assert.ok(searchEmojis("GRADUATE").includes("\u{1F393}"), "and is case-insensitive");
assert.ok(searchEmojis("food").length > 0, "a category label is searchable too");
assert.deepEqual(searchEmojis("   "), [], "a blank query returns nothing, not everything");
assert.equal(new Set(searchEmojis("heart")).size, searchEmojis("heart").length, "results are deduped");
// localStorage is absent under node — the picker must still open.
assert.deepEqual(getRecentEmojis(), [], "no storage yields no recents rather than throwing");

// ── starring a thread reply (reducer) ──
// A reply lives in `repliesByParent`, never in the main `byDistribution` list, so a reducer
// that only looks in the latter leaves a starred reply with is_starred false: no badge on
// the row, the toolbar stuck on "Add to starred", and nothing in the Starred view.

const chat = createChatSlice({
  name: "selfCheck",
  api: {} as ChatApi,                       // reducers never touch the api
  selectState: () => ({}) as ChatState,     // nor the store, outside the inbox thunk
});
const initial = chat.reducer(undefined, { type: "@@self-check/init", payload: null });
const starThreadReply = chat.reducer(
  {
    ...initial,
    byDistribution: { d1: [msg({ id: 1, reply_count: 1 })] },
    repliesByParent: { 1: [msg({ id: 2, reply_to_id: 1 })] },
    threads: [{ distribution_id: "d1", counterpart_name: "Ada", course_name: "MS Civil" } as ChatThread],
  },
  {
    type: chat.toggleMessageStar.fulfilled.type,
    payload: { messageId: 2, isStarred: true },
    meta: { arg: { messageId: 2, distributionId: "d1" } },
  } as Parameters<typeof chat.reducer>[1],
);
assert.equal(starThreadReply.repliesByParent[1]?.[0]?.is_starred, true, "starring a reply marks the reply itself");
assert.equal(starThreadReply.starred.length, 1, "and puts it in the Starred view");
assert.equal(starThreadReply.starred[0]?.id, 2, "the starred row is the reply, not its parent");

console.log("chat utils self-check: all assertions passed");
