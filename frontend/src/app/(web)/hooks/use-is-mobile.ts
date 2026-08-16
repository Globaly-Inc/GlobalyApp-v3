"use client";

import { useEffect, useState } from "react";
import { MOBILE_BREAKPOINT } from "../const/index";

export function useIsMobile() {
  // Starts false to match SSR (no `window` there) — the real value is read after
  // mount, in the effect, to avoid a hydration mismatch on narrow viewports.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
