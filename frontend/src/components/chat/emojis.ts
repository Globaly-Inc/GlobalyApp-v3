/**
 * Emoji catalogue for the composer's picker — ported from GlobalyOS V2's
 * `lib/emojis.ts`: the same seven categories in the same order, the same quick-reaction
 * row, and the same keyword search.
 *
 * V2's keyword map is exhaustive over its whole catalogue. This one covers the emoji
 * people actually search for by name and falls back to matching the category label, so
 * "food" or "heart" still find their sections without 250 lines of synonyms.
 */

export interface EmojiCategory {
  key: string;
  label: string;
  emojis: readonly string[];
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    key: "smileys",
    label: "Smileys & Emotion",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊",
      "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋",
      "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
      "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌",
      "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧",
      "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓",
      "🧐", "😕", "🫤", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳",
      "🥺", "🥹", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱",
      "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠",
    ],
  },
  {
    key: "gestures",
    label: "Gestures & People",
    emojis: [
      "👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲",
      "🤝", "🙏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆",
      "👇", "☝️", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏",
      "✍️", "💪", "👂", "👃", "🧠", "👀", "👁️", "👅", "👄", "💋",
    ],
  },
  {
    key: "hearts",
    label: "Hearts & Love",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️",
    ],
  },
  {
    key: "celebrations",
    label: "Celebrations",
    emojis: [
      "🎉", "🎊", "🎈", "🎂", "🍰", "🎁", "🎀", "🏆", "🥇", "🥈",
      "🥉", "🎖️", "🏅", "👑", "💎", "🔥", "✨", "⭐", "🌟", "💫",
      "💯", "🎯", "🚀", "🎓", "📣", "🥂", "🍾", "🎇", "🎆", "🪅",
    ],
  },
  {
    key: "objects",
    label: "Objects & Symbols",
    emojis: [
      "💡", "📌", "📎", "🔗", "📁", "📂", "📄", "📃", "📋", "📊",
      "📈", "📉", "🗓️", "📅", "⏰", "⌛", "💻", "🖥️", "📱", "☎️",
      "✉️", "📧", "🔍", "🔑", "🔒", "🔓", "⚙️", "🛠️", "✅", "❌",
      "❗", "❓", "⚠️", "🚩", "🏳️", "💰", "💳", "🧾", "📝", "✏️",
    ],
  },
  {
    key: "animals",
    label: "Animals & Nature",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦉",
      "🦋", "🐝", "🐞", "🐢", "🐠", "🐬", "🐳", "🌸", "🌼", "🌻",
      "🌹", "🌵", "🌲", "🌳", "🍀", "🍁", "🌈", "☀️", "🌙", "⛅",
    ],
  },
  {
    key: "food",
    label: "Food & Drink",
    emojis: [
      "☕", "🍵", "🧋", "🥤", "🍺", "🍷", "🍸", "🥑", "🍎", "🍌",
      "🍇", "🍓", "🍑", "🍒", "🥥", "🍕", "🍔", "🍟", "🌮", "🍜",
      "🍣", "🍱", "🍞", "🥐", "🧁", "🍪", "🍫", "🍩", "🍿", "🧊",
    ],
  },
] as const;

/** V2's `QUICK_REACTION_EMOJIS` — the row shown before anyone has picked anything. */
export const QUICK_EMOJIS: readonly string[] = [
  "👍", "❤️", "🎉", "👏", "🔥", "💯", "😂", "🤔", "😊", "✨", "🙌", "👀",
];

const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

/** Search terms per emoji, for the ones people look up by name. */
const KEYWORDS: Record<string, string> = {
  "👍": "thumbs up yes ok agree like good approve",
  "👎": "thumbs down no disagree dislike bad reject",
  "❤️": "heart love red",
  "💔": "broken heart sad",
  "🎉": "party celebrate tada congrats",
  "🎊": "party celebrate confetti",
  "👏": "clap applause well done bravo",
  "🙏": "please thanks pray thank you",
  "🔥": "fire hot lit awesome",
  "💯": "hundred perfect score",
  "😂": "laugh lol funny crying laughing",
  "🤣": "rofl laugh funny",
  "🤔": "think thinking hmm consider",
  "😊": "smile happy blush pleased",
  "😀": "grin happy smile",
  "😍": "love eyes adore heart",
  "😢": "cry sad tear",
  "😭": "sob cry sad bawling",
  "😡": "angry mad rage",
  "😅": "sweat nervous phew relief",
  "🙄": "eye roll annoyed",
  "😴": "sleep tired zzz",
  "🤯": "mind blown shocked wow",
  "🥳": "party celebrate birthday",
  "😎": "cool sunglasses",
  "✨": "sparkles shiny magic new",
  "⭐": "star favourite favorite",
  "🚀": "rocket launch ship fast",
  "🎓": "graduate graduation study degree university",
  "✅": "check tick done complete yes",
  "❌": "cross no wrong cancel",
  "⚠️": "warning caution careful",
  "❓": "question ask what",
  "❗": "exclamation important",
  "📌": "pin pinned important",
  "📎": "clip attach attachment file",
  "📄": "document file page doc",
  "📁": "folder files directory",
  "📊": "chart graph stats data",
  "📈": "chart up growth increase",
  "📉": "chart down decline decrease",
  "📅": "calendar date schedule",
  "⏰": "alarm clock time reminder",
  "💰": "money cash payment fee",
  "💳": "card payment pay credit",
  "📝": "note write memo notes",
  "✉️": "email mail letter message",
  "🔍": "search find magnify look",
  "🔒": "lock locked secure private",
  "💡": "idea lightbulb tip suggestion",
  "🏆": "trophy win award winner",
  "👑": "crown king queen best",
  "🙌": "raise hands celebrate praise hooray",
  "👀": "eyes look watching seen",
  "💪": "strong muscle flex power",
  "🤝": "handshake deal agree partner",
  "☕": "coffee tea break drink",
  "🍕": "pizza food eat",
  "🌈": "rainbow colours colors",
  "☀️": "sun sunny weather",
};

/**
 * V2's `searchEmojis`: keyword match first, then a literal match so pasting an emoji
 * finds it. Category labels are included so "food" or "hearts" surface those sections.
 */
export function searchEmojis(query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const hits = new Set<string>();
  for (const [emoji, keywords] of Object.entries(KEYWORDS)) {
    if (keywords.includes(q)) hits.add(emoji);
  }
  for (const category of EMOJI_CATEGORIES) {
    if (category.label.toLowerCase().includes(q)) category.emojis.forEach((e) => hits.add(e));
  }
  for (const emoji of ALL_EMOJIS) {
    if (emoji.includes(query)) hits.add(emoji);
  }
  return [...hits];
}

// ── Recently used ──
//
// V2 keeps these in localStorage keyed by organization, sorted by use count. Same idea,
// keyed globally: a student has one chat context, not many orgs.

const RECENT_KEY = "globaly-chat-recent-emojis";
const MAX_RECENT = 18;

export function getRecentEmojis(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    // Guard the shape: a hand-edited or stale value must not crash the picker.
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/** Most-recent-first, deduped, capped. Returns the new list so callers can re-render. */
export function pushRecentEmoji(emoji: string): string[] {
  const next = [emoji, ...getRecentEmojis().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A blocked or full quota must not stop someone sending an emoji.
  }
  return next;
}
