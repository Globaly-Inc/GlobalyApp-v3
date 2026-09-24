import { NextRequest, NextResponse } from "next/server";

// Streams a remote image back same-origin so client-side canvas code (the "Adjust image" crop
// flow) can read its pixels without depending on the storage host sending CORS headers — a
// server-to-server fetch has no CORS restriction at all, only browser JS does. Restricted to an
// allowlist of trusted storage hosts so this can't be used as an open proxy.
const ALLOWED_HOSTS = ["storage.googleapis.com"];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.includes(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  const upstream = await fetch(target, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=60",
    },
  });
}
