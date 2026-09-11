/**
 * safeFetch — the guard has to survive a REDIRECT. assertPublicUrl before a request cannot do it
 * alone: fetch follows redirects itself, so a public URL answering 302 http://169.254.169.254/
 * reaches the metadata endpoint with the check already passed.
 *
 * fetch is stubbed and the entry point is a public IP LITERAL (no DNS, no network), because a
 * local server cannot be used — the guard correctly refuses 127.0.0.1 at hop 0, so a test built
 * on one passes without ever exercising a redirect.
 * Run: node --import tsx tests/safe-fetch.ts
 */
import { safeFetch, assertPublicUrl, UnsafeUrlError } from "../src/shared/public-url.js";

let passed = 0, failed = 0;
const ok = (c: boolean, l: string) => { c ? passed++ : (failed++, console.error(`FAIL: ${l}`)); };
async function refuses(fn: () => Promise<unknown>, label: string) {
  try { await fn(); ok(false, `${label} — expected a refusal, got success`); }
  catch (e) { ok(e instanceof UnsafeUrlError, `${label}${e instanceof UnsafeUrlError ? "" : ` — wrong error: ${e}`}`); }
}

const PUBLIC = "http://93.184.216.34/";          // public IP literal: passes the guard without DNS
const real = globalThis.fetch;
/** Answers every request with a 302 to `to`, or 200 when `to` is null. */
const redirectTo = (to: string | null) => {
  globalThis.fetch = (async () =>
    to === null
      ? new Response("ok", { status: 200 })
      : new Response(null, { status: 302, headers: { location: to } })) as typeof fetch;
};

// Sanity: the entry point really is accepted, so a refusal below can only come from a later hop.
ok(!!(await assertPublicUrl(PUBLIC)), "a public IP literal is accepted at hop 0");

redirectTo("http://169.254.169.254/latest/meta-data/");
await refuses(() => safeFetch(PUBLIC), "a redirect INTO the metadata endpoint is refused");

redirectTo("http://127.0.0.1:6379/");
await refuses(() => safeFetch(PUBLIC), "a redirect to loopback is refused");

redirectTo("http://10.0.0.5/admin");
await refuses(() => safeFetch(PUBLIC), "a redirect into a private subnet is refused");

redirectTo(PUBLIC);                                // endless public → public
await refuses(() => safeFetch(PUBLIC, {}, { maxRedirects: 3 }), "a redirect chain is bounded");

redirectTo(null);
ok((await safeFetch(PUBLIC)).status === 200, "an ordinary public response passes through");

globalThis.fetch = real;

// The PDF branch of the extraction workers' secondary fetch. Its URL comes from scraped
// catalogue HTML, so it is attacker-influenced; it used a bare fetch() and reached whatever it
// was pointed at. Asserted against a REAL listening socket — a target that merely fails to
// connect would look identical to one that is refused, which is how this hid.
{
  const { createServer } = await import("node:http");
  const { createDocumentExtractor } = await import("../src/modules/superadmin/data-extraction/lib/document-extractor.js");
  let hits = 0;
  const srv = createServer((_q, res) => { hits++; res.writeHead(200, { "content-type": "application/pdf" }); res.end("%PDF-1.4"); });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as { port: number }).port;
  await createDocumentExtractor().extract({ file_url: `http://127.0.0.1:${port}/x.pdf`, file_name: "x.pdf" });
  srv.close();
  ok(hits === 0, "a PDF link pointing at loopback never reaches the socket");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
