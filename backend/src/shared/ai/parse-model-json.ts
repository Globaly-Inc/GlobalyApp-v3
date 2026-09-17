// Shared by the Gemini client and the OpenRouter fallback so the two cannot drift — the fallback
// used a bare JSON.parse and threw on every truncated response the primary path salvaged.

/** Position of the closing brace/bracket that balances the first opening one. */
function findBalancedEnd(text: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Close unclosed brackets/braces in correct nesting order and try to parse. */
function tryCloseJson(partial: string): unknown | null {
  let inString = false;
  let escape = false;
  for (const ch of partial) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') inString = !inString;
  }
  let attempt = inString ? partial + '"' : partial;

  const stack: string[] = [];
  inString = false;
  escape = false;
  for (const ch of attempt) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  attempt += stack.reverse().join("");

  try {
    return JSON.parse(attempt);
  } catch {
    return null;
  }
}

/** Longest prefix that ends on a complete value and parses once closed. */
function salvageTruncatedJson(text: string): unknown | null {
  const candidates: number[] = [];
  const re = /\}[\s,]|\][\s,]|",|null[,\s\]}]|true[,\s\]}]|false[,\s\]}]|\d[,\s\]}]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) candidates.push(m.index + 1);

  for (let i = candidates.length - 1; i >= 0; i--) {
    const result = tryCloseJson(text.slice(0, candidates[i]));
    if (result) return result;
  }
  return null;
}

export interface ParseResult<T> {
  value: T | null;
  /** How it parsed, for logging: clean, or which repair was needed. */
  via: "direct" | "fenced" | "balanced" | "salvaged" | "failed";
}

export function parseModelJson<T>(text: string): ParseResult<T> {
  try {
    return { value: JSON.parse(text) as T, via: "direct" };
  } catch { /* keep going */ }

  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return { value: JSON.parse(cleaned) as T, via: "fenced" };
  } catch { /* keep going */ }

  const end = findBalancedEnd(cleaned);
  if (end > 0 && end < cleaned.length - 1) {
    try {
      return { value: JSON.parse(cleaned.slice(0, end + 1)) as T, via: "balanced" };
    } catch { /* keep going */ }
  }

  const salvaged = salvageTruncatedJson(cleaned);
  if (salvaged) return { value: salvaged as T, via: "salvaged" };

  return { value: null, via: "failed" };
}
