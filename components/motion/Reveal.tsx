"use client";

import React from "react";
import { motion, useReducedMotion, Variants } from "motion/react";

export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_SMOOTH: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
  x?: number;
  scale?: number;
  blur?: boolean;
  once?: boolean;
  amount?: number;
}

/**
 * Reusable viewport scroll-reveal component.
 * Uses compositor-only properties (opacity, transform, and optional subtle blur on headlines/badges)
 * and automatically respects prefers-reduced-motion.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  duration = 0.55,
  y = 18,
  x = 0,
  scale = 1,
  blur = false,
  once = true,
  amount = 0.18,
}: RevealProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{
        opacity: 0,
        y,
        x,
        scale,
        ...(blur ? { filter: "blur(4px)" } : {}),
      }}
      whileInView={{
        opacity: 1,
        y: 0,
        x: 0,
        scale: 1,
        ...(blur ? { filter: "blur(0px)" } : {}),
      }}
      viewport={{ once, amount }}
      transition={{
        duration,
        delay,
        ease: EASE_OUT_EXPO,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  delayChildren?: number;
  once?: boolean;
  amount?: number;
}

export function StaggerContainer({
  children,
  className = "",
  staggerDelay = 0.08,
  delayChildren = 0.04,
  once = true,
  amount = 0.15,
}: StaggerContainerProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren,
      },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
  y?: number;
  x?: number;
  scale?: number;
  duration?: number;
}

export function StaggerItem({
  children,
  className = "",
  y = 16,
  x = 0,
  scale = 1,
  duration = 0.5,
}: StaggerItemProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y, x, scale },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      scale: 1,
      transition: {
        duration,
        ease: EASE_OUT_EXPO,
      },
    },
  };

  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * Animated Hamburger-to-X icon using compositor transforms.
 */
export function AnimatedHamburgerIcon({
  isOpen,
  reducedMotion = false,
}: {
  isOpen: boolean;
  reducedMotion?: boolean;
}) {
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.26, ease: EASE_OUT_EXPO };

  return (
    <div className="relative w-5 h-5 flex items-center justify-center" aria-hidden="true">
      <motion.span
        initial={false}
        animate={
          isOpen
            ? { rotate: 45, y: 0 }
            : { rotate: 0, y: -5 }
        }
        transition={transition}
        className="absolute w-4.5 h-[1.75px] bg-slate-800 rounded-full origin-center"
      />
      <motion.span
        initial={false}
        animate={
          isOpen
            ? { opacity: 0, scaleX: 0.4 }
            : { opacity: 1, scaleX: 1 }
        }
        transition={transition}
        className="absolute w-4.5 h-[1.75px] bg-slate-800 rounded-full origin-center"
      />
      <motion.span
        initial={false}
        animate={
          isOpen
            ? { rotate: -45, y: 0 }
            : { rotate: 0, y: 5 }
        }
        transition={transition}
        className="absolute w-4.5 h-[1.75px] bg-slate-800 rounded-full origin-center"
      />
    </div>
  );
}
