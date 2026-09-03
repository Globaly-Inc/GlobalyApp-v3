/**
 * The composer's formatting toolbar, ported from GlobalyOS V2's
 * `MessageComposer.applyFormatting`. V2's chat composer is a plain textarea whose
 * toolbar inserts markdown into the text — the "rich text" lives in the RENDERER, not
 * in a contenteditable editor. Keeping that means the stored message body stays plain
 * text, which is what our `enquiry_messages.body` column already is.
 */

export type MarkFormat = "bold" | "italic" | "strikethrough" | "code" | "link" | "bullet" | "numbered";

/** The result of applying a format: the new text and where the caret should land. */
export interface FormatResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wraps the selection in `token`, or drops an empty pair with the caret inside it. */
function wrap(value: string, start: number, end: number, token: string): FormatResult {
  const selected = value.slice(start, end);
  const text = `${value.slice(0, start)}${token}${selected}${token}${value.slice(end)}`;
  // With nothing selected the caret goes between the tokens so typing is formatted;
  // with a selection it stays around the now-wrapped text.
  return selected
    ? { text, selectionStart: start + token.length, selectionEnd: end + token.length }
    : { text, selectionStart: start + token.length, selectionEnd: start + token.length };
}

/** Prefixes every selected line, or starts one new item when nothing is selected. */
function listify(value: string, start: number, end: number, ordered: boolean): FormatResult {
  const selected = value.slice(start, end);
  const marker = (i: number) => (ordered ? `${i + 1}. ` : "• ");
  const body = selected
    ? selected
        .split("\n")
        .map((line, i) => `${marker(i)}${line}`)
        .join("\n")
    : marker(0);
  const text = `${value.slice(0, start)}${body}${value.slice(end)}`;
  return { text, selectionStart: start + body.length, selectionEnd: start + body.length };
}

export function applyFormat(value: string, start: number, end: number, format: MarkFormat): FormatResult {
  switch (format) {
    case "bold":
      return wrap(value, start, end, "**");
    case "italic":
      return wrap(value, start, end, "_");
    case "strikethrough":
      return wrap(value, start, end, "~~");
    case "code":
      return wrap(value, start, end, "`");
    case "bullet":
      return listify(value, start, end, false);
    case "numbered":
      return listify(value, start, end, true);
    case "link": {
      // V2's Link button is inert; a URL typed inline is auto-linked by the renderer
      // anyway, so this inserts the markdown shape and parks the caret in the target.
      const label = value.slice(start, end) || "text";
      const inserted = `[${label}](url)`;
      const text = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
      const urlStart = start + label.length + 3;
      return { text, selectionStart: urlStart, selectionEnd: urlStart + 3 };
    }
  }
}

// ── Rendering ──

/** Inline segments a message body is rendered from. */
export type Segment =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "strong" | "em" | "del"; value: string };

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+[^\s<.,!?;:'")\]]/gi;

/** V2's `truncateUrl` — a bare link renders as `host/path`, capped. */
export function truncateUrl(url: string, maxLength = 40): string {
  try {
    const parsed = new URL(url.startsWith("www.") ? `https://${url}` : url);
    const display = (parsed.hostname + parsed.pathname).replace(/\/$/, "");
    return display.length <= maxLength ? display : `${display.slice(0, maxLength - 3)}...`;
  } catch {
    return url.length <= maxLength ? url : `${url.slice(0, maxLength - 3)}...`;
  }
}

// Longest-token-first so `**bold**` is not eaten by the single-`*` italic rule, and
// `~~` before anything else that could split it. Mirrors V2's replace() order.
const INLINE = [
  { kind: "strong" as const, re: /\*\*([^*]+)\*\*|__([^_]+)__/ },
  { kind: "del" as const, re: /~~([^~]+)~~/ },
  { kind: "em" as const, re: /(?<![\w*])\*([^*]+)\*(?![\w*])|(?<![\w_])_([^_]+)_(?![\w_])/ },
];

function parseEmphasis(text: string): Segment[] {
  for (const { kind, re } of INLINE) {
    const match = re.exec(text);
    if (!match) continue;
    const value = match[1] ?? match[2] ?? "";
    return [
      ...parseEmphasis(text.slice(0, match.index)),
      { kind, value },
      ...parseEmphasis(text.slice(match.index + match[0].length)),
    ];
  }
  return text ? [{ kind: "text", value: text }] : [];
}

function parseLinks(text: string): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    const at = match.index;
    if (at > cursor) out.push(...parseEmphasis(text.slice(cursor, at)));
    out.push({ kind: "link", href: url.startsWith("www.") ? `https://${url}` : url, label: truncateUrl(url) });
    cursor = at + url.length;
  }
  if (cursor < text.length) out.push(...parseEmphasis(text.slice(cursor)));
  return out;
}

/**
 * Splits a message body into renderable segments. Code spans are taken first so
 * nothing inside backticks is reinterpreted, then links, then emphasis — the same
 * precedence as V2's `renderTextWithCodeAndUrls` → `renderFormattedText` chain.
 *
 * Everything comes back as data, never HTML: the React renderer emits real elements,
 * so unlike V2 there is no `dangerouslySetInnerHTML` and nothing to sanitise.
 */
export function parseMessageBody(body: string): Segment[] {
  return body.split(/(`[^`]+`)/g).flatMap((part) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1
      ? [{ kind: "code" as const, value: part.slice(1, -1) }]
      : parseLinks(part),
  );
}
