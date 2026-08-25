"use client";

import {motion, AnimatePresence, useInView, useMotionValue, useSpring} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

// ──────────────────────────────────────────────────────────────
// Page Transition — cinematic entrance for every route
// ──────────────────────────────────────────────────────────────

export function AnimatedPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.15,
        ease: "easeOut",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Staggered Container — children reveal one-by-one
// ──────────────────────────────────────────────────────────────

export function StaggerContainer({
  children,
  className,
  delay = 0,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            delayChildren: delay,
            staggerChildren: stagger,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  y = 8,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.2, ease: "easeOut" },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Spring Card — hover with spring physics + glow
// ──────────────────────────────────────────────────────────────

export function SpringCard({
  children,
  className,
  glow = "navy",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  glow?: "navy" | "amber" | "soft" | "none";
  onClick?: () => void;
}) {
  const glowClass =
    glow === "amber" ? "hover:glow-amber" :
    glow === "navy" ? "hover:glow-navy" :
    glow === "soft" ? "hover:glow-soft" :
    "";

  return (
    <motion.div
      whileHover={{
        y: -4,
        transition: { type: "spring", stiffness: 400, damping: 25 },
      }}
      whileTap={onClick ? { y: 0, scale: 0.98 } : undefined}
      onClick={onClick}
      className={`transition-shadow duration-300 ${glowClass} ${className ?? ""}`}
    >
      {children}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Animated Counter — counts up from 0 to target on mount
// ──────────────────────────────────────────────────────────────

export function AnimatedCounter({
  value,
  duration = 1.2,
  format = (n: number) => n.toLocaleString("en-IN"),
  className,
  prefix = "",
  suffix = "",
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let startTime: number | null = null;
    let frame: number;
    const animate = (ts: number) => {
      if (startTime === null) startTime = ts;
      const progress = Math.min((ts - startTime) / (duration * 1000), 1);
      // easeOutExpo for dramatic finish
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(value * eased);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isInView, value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}{format(display)}{suffix}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Magnetic Button — attracts toward cursor on hover
// ──────────────────────────────────────────────────────────────

export function MagneticButton({
  children,
  className,
  strength = 0.3,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  function handleMove(e: React.MouseEvent) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    x.set(offsetX * strength);
    y.set(offsetY * strength);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Fade-In On Scroll — for content lower on the page
// ──────────────────────────────────────────────────────────────

export function FadeInOnScroll({
  children,
  className,
  delay = 0,
  y = 12,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={isInView ? {
        opacity: 1,
        y: 0,
        transition: { duration: 0.2, delay, ease: "easeOut" },
      } : {}}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Glow Orb — animated background decoration
// ──────────────────────────────────────────────────────────────

export function GlowOrb({
  className,
  color = "amber",
  size = 400,
}: {
  className?: string;
  color?: "amber" | "navy";
  size?: number;
}) {
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute rounded-full blur-3xl ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background:
          color === "amber"
            ? "radial-gradient(circle, oklch(0.72 0.14 75 / 0.25), transparent 70%)"
            : "radial-gradient(circle, oklch(0.32 0.08 255 / 0.3), transparent 70%)",
      }}
      animate={{
        scale: [1, 1.15, 1],
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

// ──────────────────────────────────────────────────────────────
// Route Transition Overlay — wipes across screen on route change
// ──────────────────────────────────────────────────────────────

export function RouteTransition({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          exit={{ scaleY: 0 }}
          transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
          style={{
            transformOrigin: "bottom",
            background: "linear-gradient(135deg, var(--navy-deep), var(--navy-mid))",
          }}
        />
      )}
    </AnimatePresence>
  );
}
