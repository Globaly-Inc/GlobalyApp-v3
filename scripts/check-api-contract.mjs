#!/usr/bin/env node
// Fails the build when the frontend calls a backend endpoint that does not exist.
//
// Backend truth: backend/src/server.ts registers modules, modules register sub-modules and
// route files, each register() optionally adding a prefix. We walk that tree from server.ts
// so the full path of every `app.<method>("...")` is derived, not guessed.
//
// Frontend calls: every frontend/src/**/apis/real-api.ts, with `${...}` interpolations
// collapsed to wildcards so comparison is structural rather than value-based.
//
// Endpoints a later wave will build live in scripts/api-contract-allowlist.json, each
// tagged with the wave that builds it. The allowlist should shrink as waves land.
//
// Usage: node scripts/check-api-contract.mjs [--json]

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = join(ROOT, "backend", "src");
const FRONTEND_SRC = join(ROOT, "frontend", "src");
const ALLOWLIST_FILE = join(ROOT, "scripts", "api-contract-allowlist.json");
const API_PREFIX = "/api/v3"; // frontend http.ts hardcodes this onto every request

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
const CLIENT_METHOD = {
  httpGet: "GET",
  httpPost: "POST",
  httpPostForm: "POST",
  httpPostNoContent: "POST",
  httpPut: "PUT",
  httpPatch: "PATCH",
  httpDelete: "DELETE",
};

// A dynamic `${...}` segment. Chosen because it cannot appear in source.
const HOLE = "\u0000";

// ── file walking ─────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ── string-literal scanning ──────────────────────────────────────────────────

/**
 * Reads the string/template literal that starts at `src[i]`.
 * Returns { raw, end } where every `${expr}` is collapsed to HOLE, or null if
 * `src[i]` does not open a literal. Handles nested templates inside `${}`.
 */
function readLiteral(src, i) {
  const quote = src[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let out = "";
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") {
      out += src[j + 1] ?? "";
      j += 2;
      continue;
    }
    if (ch === quote) return { raw: out, end: j + 1 };
    if (quote === "`" && ch === "$" && src[j + 1] === "{") {
      // skip the expression, tracking braces and nested literals
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        const c = src[j];
        if (c === '"' || c === "'" || c === "`") {
          const nested = readLiteral(src, j);
          j = nested ? nested.end : j + 1;
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") depth--;
        j++;
      }
      out += HOLE;
      continue;
    }
    out += ch;
    j++;
  }
  return null; // unterminated
}

/** Skips whitespace and an optional `<...>` type argument list after a call name. */
function skipToArg(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] === "<") {
    let depth = 0;
    while (i < src.length) {
      if (src[i] === "<") depth++;
      else if (src[i] === ">" && --depth === 0) {
        i++;
        break;
      }
      i++;
    }
  }
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== "(") return -1;
  i++;
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

// ── backend: build the real route table ──────────────────────────────────────

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec).replace(/\.js$/, "");
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Maps every imported binding in a file to the .ts file that defines it. */
function importMap(file, src) {
  const map = new Map();
  const re = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    const target = resolveImport(file, m[2]);
    if (!target) continue;
    const clause = m[1].replace(/^type\s+/, "");
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) map.set(name, target);
      }
    }
    const def = clause.replace(/\{[\s\S]*?\}/, "").replace(/,/g, "").trim();
    if (def && !def.startsWith("*")) map.set(def, target);
  }
  return map;
}

/** Local `const NAME = "/literal";` declarations, so a prefix passed by identifier resolves. */
function localStringConsts(src) {
  const out = new Map();
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]([^"'`]*)["'`]\s*;/g;
  for (const m of src.matchAll(re)) out.set(m[1], m[2]);
  return out;
}

/** `.register(ident, { prefix: "..." })` calls in a file, with the prefix (or ""). */
function registerCalls(src) {
  const consts = localStringConsts(src);
  const re = /\.register\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
  return [...src.matchAll(re)].map((m) => {
    const opts = m[2] ?? "";
    // `prefix: "/literal"`
    let prefix = opts.match(/prefix\s*:\s*["'`]([^"'`]*)["'`]/)?.[1];
    if (prefix === undefined) {
      // `prefix: someIdent` or the shorthand `{ prefix }` — resolve via a local const.
      const ident = opts.match(/prefix\s*:\s*([A-Za-z_$][\w$]*)/)?.[1]
        ?? (/(^|[{,\s])prefix\s*(?=[,}]|$)/.test(opts) ? "prefix" : undefined);
      if (ident) prefix = consts.get(ident);
    }
    return { name: m[1], prefix: prefix ?? "" };
  });
}

function routesIn(src) {
  const found = [];
  const consts = localStringConsts(src);

  // 1. Quoted literal: app.get("/services/:id", ...)
  const lit = new RegExp(`\\b[A-Za-z_$][\\w$]*\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*["'\`](/[^"'\`]*)["'\`]`, "g");
  for (const m of src.matchAll(lit)) found.push({ method: m[1].toUpperCase(), path: m[2] });

  // 2. Template literal opening with a const: app.get(`${prefix}/search`, ...)
  const tpl = new RegExp(`\\b[A-Za-z_$][\\w$]*\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*\\\`\\$\\{\\s*([A-Za-z_$][\\w$]*)\\s*\\}([^\\\`]*)\\\``, "g");
  for (const m of src.matchAll(tpl)) {
    const base = consts.get(m[2]);
    if (base !== undefined) found.push({ method: m[1].toUpperCase(), path: base + m[3] });
  }

  // 3. Bare const identifier: app.get(prefix, ...)
  const ident = new RegExp(`\\b[A-Za-z_$][\\w$]*\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*,`, "g");
  for (const m of src.matchAll(ident)) {
    const base = consts.get(m[2]);
    if (base !== undefined && base.startsWith("/")) found.push({ method: m[1].toUpperCase(), path: base });
  }

  return found;
}

function collectBackendRoutes() {
  const routes = [];
  const seen = new Set();

  const visit = (file, prefix) => {
    const key = `${file}|${prefix}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!existsSync(file)) return;
    const src = readFileSync(file, "utf8");

    for (const r of routesIn(src)) {
      routes.push({ method: r.method, path: normalize(prefix + r.path) });
    }

    const imports = importMap(file, src);
    for (const call of registerCalls(src)) {
      const target = imports.get(call.name);
      // A register() of a locally-declared plugin adds its prefix to this same file's scope.
      if (target) visit(target, prefix + call.prefix);
    }
  };

  visit(join(BACKEND_SRC, "server.ts"), "");
  return routes;
}

// ── path normalisation & matching ────────────────────────────────────────────

function normalize(path) {
  return path.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

/** Backend path -> segments, with `:name` params kept as a marker. */
const backendSegments = (path) => normalize(path).split("/").slice(1).map((s) => (s.startsWith(":") ? ":param" : s));

/**
 * Frontend path (holes already collapsed) -> segment patterns.
 * A bare hole is a param; a hole mixed with literal text becomes a glob.
 */
function frontendSegments(path) {
  const noQuery = path.split("?")[0];
  return normalize(noQuery)
    .split("/")
    .slice(1)
    .map((s) => (s === HOLE ? ":param" : s));
}

function segmentMatches(fe, be) {
  if (fe === ":param" || be === ":param") return true;
  if (!fe.includes(HOLE)) return fe === be;
  const rx = new RegExp(`^${fe.split(HOLE).map(escapeRe).join(".*")}$`);
  return rx.test(be);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matches(call, route) {
  if (call.method !== route.method) return false;
  const fe = frontendSegments(call.path);
  const be = backendSegments(route.path);
  if (fe.length !== be.length) return false;
  return fe.every((seg, i) => segmentMatches(seg, be[i]));
}

// ── frontend: collect the calls ──────────────────────────────────────────────

function collectFrontendCalls() {
  const files = walk(FRONTEND_SRC).filter((f) => f.endsWith(`${join("apis", "real-api.ts")}`));
  const calls = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");

    // Local path constants, e.g. `const BASE = "/admin/platform";`
    const consts = new Map();
    for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"']*)["']\s*;/g)) {
      consts.set(m[1], m[2]);
    }

    const nameRe = new RegExp(`\\b(${Object.keys(CLIENT_METHOD).join("|")})\\b`, "g");
    for (const m of src.matchAll(nameRe)) {
      const argStart = skipToArg(src, m.index + m[0].length);
      if (argStart < 0) continue; // an import or re-export, not a call
      const lit = readLiteral(src, argStart);
      if (!lit) continue;

      // Re-expand `${CONST}` holes whose expression was a known path constant.
      const path = expandConsts(src, argStart, lit.raw, consts);
      if (!path.startsWith("/")) continue;

      calls.push({
        method: CLIENT_METHOD[m[1]],
        path,
        file: file.slice(ROOT.length + 1),
        line: lineOf(src, m.index),
      });
    }
  }
  return calls;
}

/**
 * readLiteral() replaces every `${expr}` with HOLE. Holes whose expression was just a
 * known local constant (`${BASE}`) carry a real path, so substitute those back in.
 */
function expandConsts(src, argStart, raw, consts) {
  if (!raw.includes(HOLE) || consts.size === 0) return raw;
  const literal = readLiteralRawText(src, argStart);
  if (!literal) return raw;
  const exprs = [...literal.matchAll(/\$\{([^{}]*)\}/g)].map((m) => m[1].trim());
  let i = 0;
  return raw.replace(new RegExp(HOLE, "g"), () => {
    const expr = exprs[i++];
    return consts.has(expr) ? consts.get(expr) : HOLE;
  });
}

/** The literal's source text (with `${}` intact), used to recover constant names. */
function readLiteralRawText(src, i) {
  if (src[i] !== "`") return null;
  const parsed = readLiteral(src, i);
  return parsed ? src.slice(i + 1, parsed.end - 1) : null;
}

// ── allowlist ────────────────────────────────────────────────────────────────

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) return [];
  const parsed = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
  const entries = parsed.allowed ?? parsed;
  if (!Array.isArray(entries)) throw new Error(`${ALLOWLIST_FILE}: expected an array under "allowed"`);
  for (const e of entries) {
    if (!e.method || !e.path || !e.wave) {
      throw new Error(`${ALLOWLIST_FILE}: every entry needs method, path and wave — got ${JSON.stringify(e)}`);
    }
  }
  return entries;
}

// Same matching as a real route, so an entry covers exactly the calls a built
// endpoint would. Plain string equality here would miss any call whose path is
// built by interpolation (e.g. `${BASE}/visa${qs({ q })}`), which matches a route
// fine but could never match an allowlist entry.
const allowMatches = (call, entry) => {
  if (call.method !== entry.method.toUpperCase()) return false;
  const fe = frontendSegments(call.path);
  const be = backendSegments(entry.path);
  if (fe.length !== be.length) return false;
  return fe.every((seg, i) => segmentMatches(seg, be[i]));
};

// ── main ─────────────────────────────────────────────────────────────────────

const routes = collectBackendRoutes();
const calls = collectFrontendCalls();
const allowlist = loadAllowlist();

const matched = [];
const allowed = [];
const missing = [];

for (const call of calls) {
  const full = normalize(API_PREFIX + call.path);
  const target = { ...call, path: full };
  if (routes.some((r) => matches(target, r))) matched.push(target);
  else {
    const entry = allowlist.find((e) => allowMatches(call, e));
    if (entry) allowed.push({ ...target, wave: entry.wave });
    else missing.push(target);
  }
}

const unusedAllowlist = allowlist.filter((e) => !allowed.some((a) => allowMatches({ ...a, path: a.path.slice(API_PREFIX.length) }, e)));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ backendRoutes: routes.length, matched: matched.length, allowlisted: allowed.length, missing }, null, 2));
} else {
  console.log(`API contract — ${routes.length} backend routes, ${calls.length} frontend calls\n`);
  console.log(`  matched      ${matched.length}`);
  console.log(`  allowlisted  ${allowed.length}${allowed.length ? ` (waves: ${[...new Set(allowed.map((a) => a.wave))].sort().join(", ")})` : ""}`);
  console.log(`  MISSING      ${missing.length}`);

  if (allowed.length) {
    console.log("\nAllowlisted — scheduled, not yet built:");
    const byWave = new Map();
    for (const a of allowed) byWave.set(a.wave, [...(byWave.get(a.wave) ?? []), a]);
    for (const [wave, items] of [...byWave].sort()) {
      console.log(`  Wave ${wave}`);
      for (const i of items) console.log(`    ${i.method.padEnd(6)} ${i.path}`);
    }
  }

  if (missing.length) {
    console.log("\nNo backend route for these frontend calls:");
    for (const m of missing) {
      console.log(`  ${m.method.padEnd(6)} ${m.path}\n         ${m.file}:${m.line}`);
    }
    console.log("\nFix the path, build the endpoint, or add it to scripts/api-contract-allowlist.json with the wave that builds it.");
  }

  if (unusedAllowlist.length) {
    console.log("\nStale allowlist entries (no frontend call needs them — delete them):");
    for (const e of unusedAllowlist) console.log(`  ${e.method.padEnd(6)} ${e.path}  [wave ${e.wave}]`);
  }
}

process.exit(missing.length > 0 ? 1 : 0);
