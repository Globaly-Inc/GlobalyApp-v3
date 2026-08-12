// Port of V2 crawlRules.ts — rule-based URL filtering for crawl jobs.

export type CrawlKind = "visa" | "faq" | "country_guide";

export interface CrawlRules {
  include_keywords: string[];
  exclude_keywords: string[];
  prefer_paths: string[];
}

const DEFAULTS: Record<CrawlKind, CrawlRules> = {
  visa: {
    include_keywords: [
      "visa", "visas", "subclass", "student-visa", "tier-4", "tier-2", "graduate-route",
      "skilled-worker", "work-visa", "study-visa", "working-holiday", "post-study",
      "immigration", "immi", "permit", "residency", "sponsorship",
      "news", "updates", "announcements", "guidance", "policy", "press-release",
      "statement-of-changes", "immigration-rules", "whats-new", "what-s-new",
      "fees", "processing-times", "checklist", "requirements", "eligibility",
    ],
    exclude_keywords: [
      "citizenship", "passport", "nationality", "british-citizen", "naturalisation",
      "marriage", "civil-partnership", "asylum", "refugee",
      "/contact", "/cookies", "/accessibility", "/print", "/feedback",
      "/search", "/sitemap", "/login", "/sign-in", "/sign-up", "/register",
      "/privacy", "/disclaimer", "/copyright",
    ],
    prefer_paths: ["/visas/", "/visa/", "/visa-listing/", "/immigration/", "/news/", "/updates/", "/guidance/", "/policy/"],
  },
  faq: {
    include_keywords: ["faq", "faqs", "help", "guide", "how-to", "questions", "support"],
    exclude_keywords: ["/contact", "/cookies", "/accessibility", "/print"],
    prefer_paths: [],
  },
  country_guide: {
    include_keywords: [
      "country", "guide", "studying-in", "living-in", "cost-of-living",
      "scholarships", "universities", "education", "study-abroad",
    ],
    exclude_keywords: ["/contact", "/cookies", "/accessibility", "/print", "/sitemap"],
    prefer_paths: [],
  },
};

const ASSET_EXTS = [
  ".pdf", ".zip", ".rar", ".7z", ".tar", ".gz",
  ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
  ".mp4", ".mp3", ".mov", ".avi", ".wav",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".css", ".js", ".xml", ".json",
];

const NEWS_PATH_RE = /\/(news|updates|announcements|press-release|statement-of-changes)\b/;

export function getRulesForKind(kind: CrawlKind, override?: Partial<CrawlRules>): CrawlRules {
  const base = DEFAULTS[kind];
  if (!override) return base;
  return {
    include_keywords: override.include_keywords?.length ? override.include_keywords : base.include_keywords,
    exclude_keywords: override.exclude_keywords?.length ? override.exclude_keywords : base.exclude_keywords,
    prefer_paths: override.prefer_paths ?? base.prefer_paths,
  };
}

interface ScoredUrl { url: string; score: number }

export function filterAndRankUrls(
  urls: string[],
  seedUrl: string,
  rules: CrawlRules,
): { kept: string[]; rejected: string[]; scored: ScoredUrl[] } {
  const include = rules.include_keywords.map((s) => s.toLowerCase());
  const exclude = rules.exclude_keywords.map((s) => s.toLowerCase());
  const prefer = rules.prefer_paths.map((s) => s.toLowerCase());

  let seedPrefix = "";
  try {
    const u = new URL(seedUrl);
    seedPrefix = (u.origin + u.pathname.replace(/\/[^/]*$/, "/")).toLowerCase();
  } catch { /* ignore */ }

  const scored: ScoredUrl[] = [];
  const rejected: string[] = [];

  for (const raw of urls) {
    if (!raw) continue;
    const lower = raw.toLowerCase();

    // Exclude: asset extensions
    if (ASSET_EXTS.some((ext) => lower.split("?")[0].endsWith(ext))) { rejected.push(raw); continue; }
    // Exclude: keyword blocklist
    if (exclude.some((kw) => lower.includes(kw))) { rejected.push(raw); continue; }

    let score = 0;
    let hasIncludeMatch = false;

    for (const kw of include) {
      if (lower.includes(kw)) { score += 2; hasIncludeMatch = true; }
    }
    for (const p of prefer) {
      if (lower.includes(p)) score += 3;
    }
    if (seedPrefix && lower.startsWith(seedPrefix)) score += 1;
    if (NEWS_PATH_RE.test(lower)) { score += 2; hasIncludeMatch = true; }

    // Must match at least one include keyword or live under seed path
    if (!hasIncludeMatch && !(seedPrefix && lower.startsWith(seedPrefix))) {
      rejected.push(raw);
      continue;
    }

    // Depth penalty
    try {
      const depth = new URL(raw).pathname.split("/").filter(Boolean).length;
      if (depth > 7) score -= 1;
    } catch { /* ignore */ }

    scored.push({ url: raw, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return { kept: scored.map((s) => s.url), rejected, scored };
}
