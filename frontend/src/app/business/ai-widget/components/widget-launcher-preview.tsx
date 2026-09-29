"use client";

// Mounts the widget on THIS page the way a website would: the same script tag from
// public/embed.js, with the given key. The orb renders bottom-right; the script and the
// launcher it created are removed on unmount so it never follows the user around the portal.

import { useEffect } from "react";

const LAUNCHER_ID = "globaly-ai-launcher"; // what embed.js renders

export function WidgetLauncherPreview({ embedKey }: Readonly<{ embedKey: string }>) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = `${window.location.origin}/embed.js`;
    script.async = true;
    script.dataset.key = embedKey;
    document.body.appendChild(script);
    return () => {
      script.remove();
      document.getElementById(LAUNCHER_ID)?.remove();
    };
  }, [embedKey]);
  return null;
}
