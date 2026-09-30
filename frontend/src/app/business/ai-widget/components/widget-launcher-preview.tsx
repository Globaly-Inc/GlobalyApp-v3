"use client";

// Mounts the widget on THIS page the way a website would: the same script tag from
// public/embed.js, with the given key. The orb renders bottom-right; the script and the
// launcher it created are removed on unmount so it never follows the user around the portal.

import { useEffect } from "react";

const LAUNCHER_ID = "globaly-ai-launcher"; // what embed.js renders

/**
 * How many of these are mounted right now. Module scope, not a per-effect flag, because Strict
 * Mode runs mount → cleanup → mount and the two runs fight over ONE launcher:
 *
 *   1. run A appends script A; cleanup A removes the tag but cannot cancel a fetch in flight
 *   2. run B appends script B
 *   3. script A executes anyway and creates the launcher
 *   4. script B executes and does NOTHING — embed.js dedupes on #globaly-ai-launcher
 *   5. script A's load fires, sees its own run was cancelled, and sweeps the launcher away
 *
 * So the preview came up with no orb at all. A per-run flag cannot tell "my component went away"
 * from "it remounted"; a live count can, and only a drop to zero means the page really left.
 */
let liveMounts = 0;

export function WidgetLauncherPreview({ embedKey }: Readonly<{ embedKey: string }>) {
  useEffect(() => {
    liveMounts += 1;
    const dropLauncher = () => document.getElementById(LAUNCHER_ID)?.remove();

    const script = document.createElement("script");
    script.src = `${window.location.origin}/embed.js`;
    script.async = true;
    script.dataset.key = embedKey;
    // Removing an async script tag does not cancel a load already in flight, so a launcher can
    // still appear after this component is gone. Sweep it only when nothing is mounted — if a
    // remount is waiting, that launcher is the one it is going to use.
    script.addEventListener("load", () => { if (liveMounts === 0) dropLauncher(); });
    document.body.appendChild(script);

    return () => {
      liveMounts -= 1;
      script.remove();
      if (liveMounts === 0) dropLauncher();
    };
  }, [embedKey]);
  return null;
}
