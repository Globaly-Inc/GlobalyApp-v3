"use client";

import { useEffect, useRef } from "react";
import styles from "./coming-soon.module.css";

// Interactive gold constellation (drifts, links to the cursor, gentle pull).
export function ComingSoonConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const root = canvas.parentElement as HTMLElement | null;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    type Node = { x: number; y: number; vx: number; vy: number };
    let nodes: Node[] = [];
    const goldRGB = "245, 190, 74";
    const pointer = { x: 0, y: 0, active: false };
    const CURSOR_R = 190;

    const seed = () => {
      const count = Math.min(64, Math.round((w * h) / 26000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
      }));
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left; pointer.y = e.clientY - rect.top; pointer.active = true;
      if (root) {
        root.style.setProperty("--px", String(e.clientX / window.innerWidth - 0.5));
        root.style.setProperty("--py", String(e.clientY / window.innerHeight - 0.5));
      }
    };
    const onLeave = () => { pointer.active = false; };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const LINK = 150;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]!;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < LINK) {
            ctx.strokeStyle = `rgba(${goldRGB}, ${(1 - dist / LINK) * 0.22})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      if (pointer.active) {
        for (const n of nodes) {
          const dist = Math.hypot(pointer.x - n.x, pointer.y - n.y);
          if (dist < CURSOR_R) {
            ctx.strokeStyle = `rgba(${goldRGB}, ${(1 - dist / CURSOR_R) * 0.6})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(pointer.x, pointer.y); ctx.lineTo(n.x, n.y); ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(${goldRGB}, 0.9)`;
        ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${goldRGB}, 0.55)`;
        ctx.beginPath(); ctx.arc(n.x, n.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    };
    const step = () => {
      for (const n of nodes) {
        if (pointer.active) {
          const dx = pointer.x - n.x, dy = pointer.y - n.y, d = Math.hypot(dx, dy);
          if (d < CURSOR_R && d > 1) {
            const f = (1 - d / CURSOR_R) * 0.035;
            n.vx += (dx / d) * f; n.vy += (dy / d) * f;
          }
        }
        n.vx *= 0.99; n.vy *= 0.99;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > 1.1) { n.vx = (n.vx / sp) * 1.1; n.vy = (n.vy / sp) * 1.1; }
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduce) {
      draw();
    } else {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerleave", onLeave);
      raf = requestAnimationFrame(step);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles["cs-canvas"]} aria-hidden="true" />;
}
