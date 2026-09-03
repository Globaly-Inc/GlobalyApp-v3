import { mentionDisplayName } from "./mentions";
import type { Mention } from "../apis/types";

type Block = { kind: "text"; content: string } | { kind: "ul" | "ol"; items: string[] };

/** Groups consecutive `- item` / `1. item` lines into list blocks; everything else stays as plain text. */
function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let textLines: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flushText = () => {
    if (textLines.length) {
      blocks.push({ kind: "text", content: textLines.join("\n") });
      textLines = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const line of content.split("\n")) {
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet) {
      flushText();
      if (list?.kind !== "ul") {
        flushList();
        list = { kind: "ul", items: [] };
      }
      list.items.push(bullet[1] ?? "");
    } else if (numbered) {
      flushText();
      if (list?.kind !== "ol") {
        flushList();
        list = { kind: "ol", items: [] };
      }
      list.items.push(numbered[1] ?? "");
    } else {
      flushList();
      textLines.push(line);
    }
  }
  flushText();
  flushList();
  return blocks;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Bold/italic/underline markers plus @mentions, all in one pass so they can't clash mid-token. */
function renderInline(text: string, mentions: Mention[], keyPrefix: string) {
  const names = mentions.map((m) => `@${mentionDisplayName(m)}`);
  const alternatives = ["\\*\\*.+?\\*\\*", "<u>.+?</u>", "_.+?_", ...names.map(escapeRegExp)];
  const pattern = new RegExp(`(${alternatives.join("|")})`, "g");

  return text.split(pattern).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (names.includes(part)) {
      return (
        <span key={key} className="font-medium text-primary">
          {part}
        </span>
      );
    }
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^<u>.+<\/u>$/.test(part)) return <u key={key}>{part.slice(3, -4)}</u>;
    if (/^_.+_$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    return part;
  });
}

/** Renders post/comment content: **bold**, _italic_, <u>underline</u>, `- `/`1. ` lists, and @mentions. */
export function renderFormattedContent(content: string, mentions: Mention[]) {
  return parseBlocks(content).map((block, bi) => {
    const key = `block-${bi}`;
    if (block.kind === "text") {
      return (
        <p key={key} className="whitespace-pre-wrap">
          {renderInline(block.content, mentions, key)}
        </p>
      );
    }
    const ListTag = block.kind === "ul" ? "ul" : "ol";
    return (
      <ListTag key={key} className={block.kind === "ul" ? "list-disc pl-5" : "list-decimal pl-5"}>
        {block.items.map((item, ii) => (
          <li key={`${key}-${ii}`}>{renderInline(item, mentions, `${key}-${ii}`)}</li>
        ))}
      </ListTag>
    );
  });
}
