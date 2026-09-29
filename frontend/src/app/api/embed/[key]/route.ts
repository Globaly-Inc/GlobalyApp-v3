// public/embed.js runs on a customer's site and only knows OUR origin (from its own src), not
// the API's. This hands it the widget's public branding so the launcher can tint itself before
// anyone opens the panel. Same payload as the backend's /embed/resolve, nothing more.

import { NextResponse } from "next/server";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const res = await fetch(`${API}/api/v3/ai-chat/embed/resolve?key=${encodeURIComponent(key)}`, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await res.json();
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" } });
}
