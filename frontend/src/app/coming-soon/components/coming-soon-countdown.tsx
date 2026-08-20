"use client";

import { useEffect, useState } from "react";
import { LAUNCH_MS } from "../const";
import styles from "./coming-soon.module.css";

function calcCountdown() {
  const diff = Math.max(0, LAUNCH_MS - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function ComingSoonCountdown() {
  // Start null on both server and first client render so the two match —
  // Date.now() drifts between when this page was rendered/cached and when
  // it's actually viewed, which caused hydration mismatches.
  const [cd, setCd] = useState<ReturnType<typeof calcCountdown> | null>(null);
  useEffect(() => {
    setCd(calcCountdown());
    const id = setInterval(() => setCd(calcCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  const units = [
    { label: "Days", value: cd?.days },
    { label: "Hours", value: cd?.hours },
    { label: "Minutes", value: cd?.minutes },
    { label: "Seconds", value: cd?.seconds },
  ];

  return (
    <div className={styles["cs-countdown"]} role="timer" aria-label="Time until launch">
      <span className={styles["cs-cd-label"]}>Launching in</span>
      <div className={styles["cs-cd-row"]}>
        {units.map((u) => {
          let display: string | number = "—";
          if (u.value !== undefined) display = u.label === "Days" ? u.value : pad(u.value);
          return (
            <div className={styles["cs-cd"]} key={u.label}>
              <b>{display}</b>
              <span>{u.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
