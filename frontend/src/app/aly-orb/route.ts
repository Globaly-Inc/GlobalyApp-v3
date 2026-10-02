import { readFile } from "node:fs/promises";
import path from "node:path";
import { ALY_ORB } from "@/lib/public-assets";
import { parseBrand, tintOrb } from "./tint";

/**
 * GET /aly-orb?c=1F7A4D — the Aly orb in a widget's brand colour, for the widget header and the
 * launcher on the host page (public/embed.js). No colour, or a bad one, serves the azure original.
 */
export async function GET(request: Request) {
  const svg = await readFile(path.join(process.cwd(), "public", ALY_ORB), "utf8");
  const brand = parseBrand(new URL(request.url).searchParams.get("c"));
  return new Response(brand ? tintOrb(svg, brand) : svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // Keyed by the colour in the URL, so a changed brand colour is simply a new URL.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
