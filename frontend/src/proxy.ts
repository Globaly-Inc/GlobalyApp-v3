import { NextResponse, type NextRequest } from "next/server";
import { APP_ORIGIN, WEB_ORIGIN, isPortalPath, isSharedPath } from "@/lib/hosts";

const APP_HOST = hostOf(APP_ORIGIN);
const WEB_HOST = hostOf(WEB_ORIGIN);

function hostOf(origin: string): string | null {
  try {
    return origin ? new URL(origin).host : null;
  } catch {
    return null;
  }
}

/**
 * Keeps each path on its own host: portal paths on app., public paths on web. 308 keeps the
 * method and body. Inert unless both NEXT_PUBLIC_WEB_URL and NEXT_PUBLIC_APP_URL are set, so
 * local dev, previews and any other host (an old domain still pointed here) pass straight through.
 */
export function proxy(request: NextRequest) {
  if (!APP_HOST || !WEB_HOST) return NextResponse.next();
  const host = request.headers.get("host");
  const { pathname, search } = request.nextUrl;
  if (isSharedPath(pathname)) return NextResponse.next();

  // app.'s bare root is the front door to the portals, not a second copy of the public home.
  // ponytail: always the sign-in page; send signed-in users straight to their portal once
  // sign-in learns to do that itself.
  if (host === APP_HOST && pathname === "/") return NextResponse.redirect(`${APP_ORIGIN}/auth/sign-in`, 307);

  const portal = isPortalPath(pathname);
  if (host === WEB_HOST && portal) return NextResponse.redirect(`${APP_ORIGIN}${pathname}${search}`, 308);
  if (host === APP_HOST && !portal) return NextResponse.redirect(`${WEB_ORIGIN}${pathname}${search}`, 308);
  return NextResponse.next();
}

export const config = {
  // Skip build output and static files up front; isSharedPath covers the rest.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
