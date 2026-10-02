import Image from "next/image";
import { ICON } from "@/lib/public-assets";
import { WELCOME_FEATURES } from "../const";
import styles from "./welcome-tour.module.css";

const ORBIT_RADIUS = 116;
const CONFETTI_COLORS = ["#23DDF6", "#FFFFFF", "#7FA6FF", "#FFD166", "#FF8FA3"] as const;
const GOLDEN_ANGLE = 137.5;

/**
 * Deterministic on purpose: positions come from the index, not Math.random(), so the burst is the
 * same on every render (no hydration drift, no re-randomising when a parent re-renders).
 */
const PARTICLES = Array.from({ length: 30 }, (_, i) => {
  const angle = (i * GOLDEN_ANGLE * Math.PI) / 180;
  const dist = 110 + ((i * 37) % 95);
  return {
    x: Math.round(Math.cos(angle) * dist),
    y: Math.round(Math.sin(angle) * dist * 0.9),
    r: (i * 53) % 360,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: i % 3 === 0,
    size: 6 + (i % 3) * 2,
  };
});

/** The centrepiece: logo springing in, ripples, ring guides, three feature icons orbiting, confetti. */
/** `ref` is the stage box; its centre is the logo, which the exit transition closes in on. */
export function WelcomeStage({ ref }: Readonly<{ ref?: React.Ref<HTMLDivElement> }>) {
  return (
    <div ref={ref} className="relative mx-auto h-72 w-72" aria-hidden>
      {[0, 1].map((i) => (
        <span key={i} className={`${styles.ripple} absolute left-1/2 top-1/2 -ml-12 -mt-12 h-24 w-24 rounded-[28px] border border-white/40`} style={{ "--i": i } as React.CSSProperties} />
      ))}

      <span className={`${styles.ring} absolute inset-0 rounded-full border border-white/10`} />
      <span className={`${styles.ring} absolute inset-9 rounded-full border border-white/10`} />

      <div className={`${styles.orbitIn} absolute inset-0`}>
        <div className={`${styles.orbit} absolute inset-0`}>
          {WELCOME_FEATURES.map(({ icon: Icon }, i) => {
            const angle = (360 / WELCOME_FEATURES.length) * i;
            return (
              <div key={angle} className="absolute left-1/2 top-1/2 -ml-[26px] -mt-[26px]" style={{ transform: `rotate(${angle}deg) translateY(-${ORBIT_RADIUS}px) rotate(-${angle}deg)` }}>
                <div className={styles.counter}>
                  <div className={`${styles.bob} flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_8px_30px_rgba(35,221,246,0.25)] backdrop-blur-md`} style={{ "--s": `${i * 0.7}s` } as React.CSSProperties}>
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${styles.logo} absolute left-1/2 top-1/2 -ml-12 -mt-12 flex h-24 w-24 items-center justify-center rounded-[28px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.35)]`}>
        <Image src={ICON.src} alt="" width={ICON.width} height={ICON.height} className="h-[72px] w-[72px] rounded-2xl" priority />
      </div>

      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={`${styles.particle} absolute left-1/2 top-1/2`}
          style={{ width: p.size, height: p.round ? p.size : p.size * 1.6, borderRadius: p.round ? "9999px" : 2, background: p.color, "--x": `${p.x}px`, "--y": `${p.y}px`, "--r": `${p.r}deg` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
