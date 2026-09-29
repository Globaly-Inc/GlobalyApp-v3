"use client";

// Mounts the widget on THIS page the way a website would: the same script tag from
// public/embed.js, with the given key. The orb renders bottom-right; the script and the
// launcher it created are removed on unmount so it never follows the user around the portal.

import { useEffect } from "react";

const LAUNCHER_ID = "globaly-ai-launcher"; // what embed.js renders

export function WidgetLauncherPreview({ embedKey }: Readonly<{ embedKey: string }>) {
  useEffect(() => {
    let cancelled = false;
    const dropLauncher = () => document.getElementById(LAUNCHER_ID)?.remove();

    const script = document.createElement("script");
    script.src = `${window.location.origin}/embed.js`;
    script.async = true;
    script.dataset.key = embedKey;
    // Removing an async script tag does not cancel a load already in flight, so unmounting
    // before it runs would leave it free to append its position:fixed launcher over whatever
    // portal page came next. The load event still fires on the detached element, so it is what
    // sweeps the late launcher.
    script.addEventListener("load", () => { if (cancelled) dropLauncher(); });
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.remove();
      dropLauncher();
    };
  }, [embedKey]);
  return null;
}
