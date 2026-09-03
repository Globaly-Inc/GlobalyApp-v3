"use client";

import { ComingSoonConstellation } from "./coming-soon-constellation";
import { ComingSoonCountdown } from "./coming-soon-countdown";
import { ComingSoonForm } from "./coming-soon-form";
import styles from "./coming-soon.module.css";

export function ComingSoonView() {
  return (
    <main className={styles["cs-root"]}>
      <ComingSoonConstellation />
      <div className={`${styles["cs-aurora"]} ${styles["cs-aurora-1"]}`} aria-hidden="true" />
      <div className={`${styles["cs-aurora"]} ${styles["cs-aurora-2"]}`} aria-hidden="true" />
      <div className={styles["cs-grid"]} aria-hidden="true" />
      <div className={styles["cs-scan"]} aria-hidden="true" />

      <div className={styles["cs-wrap"]}>
        <div className={styles["cs-split"]}>
          <div className={styles["cs-left"]}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/globalyapp-logo-white.png" alt="Globaly" className={styles["cs-logo"]} />
            <p className={styles["cs-tag"]}><span className={styles["cs-tag-dot"]} aria-hidden="true" />AI Education Discovery</p>
            <h1 className={styles["cs-title"]}>
              The way education is being discovered &amp; connected is going to change forever.
            </h1>
            <p className={styles["cs-sub"]}>
              We are building the world&apos;s first AI Education Counsellor that helps students choose
              the best education options and plan their career, their way, with the unbiased and right
              advice every student deserves. We also connect you with the right institutions or
              representatives for further processing.
            </p>
          </div>

          <div className={styles["cs-right"]}>
            <section className={styles["cs-panel"]} aria-live="polite">
              <div className={styles["cs-panel-glow"]} aria-hidden="true" />
              <ComingSoonForm />
            </section>
          </div>
        </div>

        <ComingSoonCountdown />
      </div>
    </main>
  );
}
