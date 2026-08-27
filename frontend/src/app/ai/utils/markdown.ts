import DOMPurify from "isomorphic-dompurify";

/**
 * Markdown → sanitized HTML for counsellor replies.
 *
 * ponytail: hand-rolled block parser covering what the model actually emits —
 * headings, lists, tables, quotes, code, links, emphasis. Ceiling: no nested
 * lists, no reference links, no inline HTML. Swap in react-markdown + remark-gfm
 * if replies start needing any of those; the call site won't change.
 *
 * Model output is escaped BEFORE any tag is generated, then sanitized on the way
 * out — a reply is attacker-influenceable text (the student writes half the
 * prompt), so it can never be trusted into dangerouslySetInnerHTML raw.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Emphasis, code spans and links. Input is escaped first, so any tag-like text is inert. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\b_([^_\n]+)_\b/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
/** The `|---|:--:|` separator under a table's header row. */
const isTableDivider = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const splitCells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function markdownToHtml(source: string): string {
  const lines = source.split("\n");
  const out: string[] = [];
  /** Bounds-safe read — every loop below is guarded by `i < lines.length`, but
   * `noUncheckedIndexedAccess` can't see that. */
  const at = (n: number) => lines[n] ?? "";
  let i = 0;

  while (i < lines.length) {
    const line = at(i);

    // Fenced code block. An unterminated fence still renders — replies stream in
    // token by token, so a half-written block is the normal case, not an error.
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(at(i))) {
        body.push(at(i));
        i++;
      }
      i++; // closing fence
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Table: a row followed by a |---| divider.
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(at(i + 1))) {
      const head = splitCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(at(i))) {
        rows.push(splitCells(at(i)));
        i++;
      }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
      const tb = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min((heading[1]?.length ?? 1) + 1, 6); // demote: h1 belongs to the page, not a reply
      out.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*\1\s*\1[\s*_-]*$/.test(line)) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Lists — a run of consecutive bullets or numbers.
    const bullet = /^\s*[-*+]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    const listType = bullet.test(line) ? "ul" : numbered.test(line) ? "ol" : null;
    if (listType) {
      const pattern = listType === "ul" ? bullet : numbered;
      const items: string[] = [];
      while (i < lines.length && pattern.test(at(i))) {
        items.push(`<li>${inline(pattern.exec(at(i))?.[1] ?? "")}</li>`);
        i++;
      }
      out.push(`<${listType}>${items.join("")}</${listType}>`);
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(at(i))) {
        quoted.push(at(i).replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(quoted.join(" "))}</blockquote>`);
      continue;
    }

    // Paragraph — consecutive non-blank lines that aren't another block.
    if (line.trim()) {
      const para: string[] = [];
      while (
        i < lines.length &&
        at(i).trim() &&
        !/^\s*(```|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(at(i)) &&
        !isTableRow(at(i))
      ) {
        para.push(at(i));
        i++;
      }
      out.push(`<p>${inline(para.join("\n")).replace(/\n/g, "<br />")}</p>`);
      continue;
    }

    i++; // blank line
  }

  return DOMPurify.sanitize(out.join(""), {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "code", "pre", "a", "ul", "ol", "li",
      "blockquote", "hr", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}
