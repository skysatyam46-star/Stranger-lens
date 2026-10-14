"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RotateCcw, ArrowLeft, Aperture, Check } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

interface ScanScreenProps {
  rawUrl: string;
  onBackToLanding: () => void;
  onCancel?: () => void;
  onOpenFaq?: () => void;
  onOpenPricing?: () => void;
  onGoToResults?: () => void;
  onRetry?: () => void;
  isBackendReady?: boolean;
  isScanning?: boolean;
  backendError?: string | null;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const SCAN_FOCUS_MESSAGES = [
  "Understanding your website's message",
  "Evaluating clarity and value",
  "Reviewing trust and next steps",
  "Connecting findings to page evidence",
] as const;

export const SCAN_STAGES = [
  { id: "connect", label: "Website connected" },
  { id: "read", label: "Website content read" },
  { id: "evaluate", label: "Evaluating clarity" },
  { id: "prepare", label: "Preparing results" },
] as const;

/**
 * Ensures error messages shown to the user remain concise, understandable,
 * and never expose raw stack traces, API keys, or internal server diagnostics.
 */
function formatSafeErrorMessage(rawError: string | null | undefined): string {
  if (!rawError || typeof rawError !== "string") {
    return "We couldn’t complete the analysis for this website. Please verify the URL and try again.";
  }
  const trimmed = rawError.trim();
  if (!trimmed) {
    return "We couldn’t complete the analysis for this website. Please verify the URL and try again.";
  }

  // Guard against accidental stack traces, raw JSON dumps, or internal key references
  const hasInternalLeak =
    trimmed.includes("\n    at ") ||
    trimmed.includes("SyntaxError") ||
    trimmed.includes("TypeError") ||
    trimmed.includes("API_KEY") ||
    trimmed.includes("Bearer ") ||
    trimmed.startsWith("{") ||
    trimmed.length > 220;

  if (hasInternalLeak) {
    return "Analysis is temporarily unavailable or the website could not be read. Please try again in a moment.";
  }
  return trimmed;
}

export default function ScanScreen({
  rawUrl,
  onBackToLanding,
  onCancel,
  onGoToResults,
  onRetry,
  isBackendReady = false,
  backendError = null,
}: ScanScreenProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasTransitionedRef = useRef(false);

  // Smooth stage tracking without cascading render effects
  const [timerStage, setTimerStage] = useState(0);
  const [prevRawUrl, setPrevRawUrl] = useState(rawUrl);

  if (rawUrl !== prevRawUrl) {
    setPrevRawUrl(rawUrl);
    setTimerStage(0);
  }

  const hasError = Boolean(backendError);
  const isActivelyScanning = !hasError && !isBackendReady;
  const handleCancel = onCancel || onBackToLanding;

  // The active visual stage index (0 to 3)
  const stageIndex = isBackendReady ? 3 : timerStage;

  // Extract clean hostname dynamically from the actual analysis input
  const cleanDomain = useMemo(() => {
    const cleaned = rawUrl.trim();
    if (!cleaned) return "";
    try {
      const withProtocol = /^https?:\/\//i.test(cleaned)
        ? cleaned
        : `https://${cleaned}`;
      const parsed = new URL(withProtocol);
      return parsed.hostname.replace(/^www\./i, "") || cleaned;
    } catch {
      return (
        cleaned
          .replace(/^https?:\/\//i, "")
          .replace(/^www\./i, "")
          .split("/")[0]
          .split("?")[0] || cleaned
      );
    }
  }, [rawUrl]);

  // Sequential progression through stages 0 -> 1 -> 2 while waiting for real async response
  useEffect(() => {
    if (hasError || isBackendReady) return;

    const timer1 = setTimeout(() => {
      setTimerStage((prev) => Math.max(prev, 1));
    }, 1000);

    const timer2 = setTimeout(() => {
      setTimerStage((prev) => Math.max(prev, 2));
    }, 2400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [hasError, isBackendReady, rawUrl]);

  // When backend is ready, render the "Preparing results" state and transition as soon as ready
  useEffect(() => {
    if (
      isBackendReady &&
      !backendError &&
      onGoToResults &&
      !hasTransitionedRef.current
    ) {
      const rafId = requestAnimationFrame(() => {
        if (!hasTransitionedRef.current) {
          hasTransitionedRef.current = true;
          onGoToResults();
        }
      });

      return () => {
        cancelAnimationFrame(rafId);
      };
    }
  }, [isBackendReady, backendError, onGoToResults]);

  const safeErrorMessage = useMemo(
    () => (hasError ? formatSafeErrorMessage(backendError) : null),
    [hasError, backendError]
  );

  const handleRetryAction = () => {
    setTimerStage(0);
    hasTransitionedRef.current = false;
    if (onRetry) {
      onRetry();
    } else {
      onBackToLanding();
    }
  };

  return (
    <div className="min-h-dvh bg-[#090D15] text-[#F1F5F9] font-sans antialiased selection:bg-[#3B82F6]/30 selection:text-white flex flex-col justify-between overflow-x-hidden">
      {/* 1. HEADER: StrangerLens (left) & Cancel (right) */}
      <header className="w-full border-b border-[#263044] bg-[#090D15]/90 backdrop-blur-md shrink-0 sticky top-0 z-20">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 md:px-8 h-[60px] sm:h-[68px] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              hasTransitionedRef.current = true;
              onBackToLanding();
            }}
            className="flex items-center gap-2.5 group cursor-pointer bg-transparent border-0 p-0 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded-lg"
            aria-label="Return to StrangerLens home"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#121824] border border-[#263044] text-[#F1F5F9] flex items-center justify-center font-bold text-xs sm:text-sm tracking-tighter shadow-xs shrink-0 group-hover:border-[#3B82F6]/60 transition-colors">
              S
            </div>
            <span className="text-base sm:text-lg font-bold tracking-tight text-[#F1F5F9] truncate">
              StrangerLens
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              hasTransitionedRef.current = true;
              handleCancel();
            }}
            className="text-xs sm:text-sm font-medium text-[#94A3B8] hover:text-[#F1F5F9] px-3.5 py-1.5 rounded-full hover:bg-[#121824] border border-transparent hover:border-[#263044] active:scale-[0.98] transition-all cursor-pointer shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
          >
            Cancel
          </button>
        </div>
      </header>

      {/* 2. CENTER: Clean, minimal and professionally balanced scanning container */}
      <main className="flex-1 w-full max-w-[480px] mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col items-center justify-center text-center min-w-0">
        {/* PREMIUM FOCUS REVEAL ANIMATION: Camera-inspired focus cycle (Soft Focus -> Focusing -> Clarity -> Reset) */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
          className="relative w-[150px] h-[150px] sm:w-[180px] sm:h-[180px] flex items-center justify-center mb-6 sm:mb-8 shrink-0 select-none"
          aria-hidden="true"
        >
          {/* Phase A/C/D: Subtle ambient blue halo bloom */}
          <motion.div
            className={`absolute inset-4 rounded-full blur-2xl pointer-events-none ${
              hasError ? "bg-rose-500/15" : "bg-[#3B82F6]/20"
            }`}
            animate={
              isActivelyScanning && !shouldReduceMotion
                ? {
                    scale: [1.18, 1.08, 0.95, 0.96, 1.18],
                    opacity: [0.3, 0.45, 0.75, 0.7, 0.3],
                  }
                : { scale: 1, opacity: hasError ? 0.3 : 0.45 }
            }
            transition={
              isActivelyScanning && !shouldReduceMotion
                ? {
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.25, 0.5, 0.75, 1],
                  }
                : undefined
            }
          />

          {/* Faint static optical guide frame (lens barrel reference) */}
          <div
            className={`absolute inset-[16px] sm:inset-[20px] rounded-full border pointer-events-none transition-colors duration-500 ${
              hasError ? "border-rose-500/20" : "border-[#263044]/50"
            }`}
          />

          {/* Precision Focus Ring: Smoothly contracts toward center (Phase B), locks in clarity (Phase C), expands out (Phase D) */}
          <motion.div
            className={`absolute w-[92px] h-[92px] sm:w-[108px] sm:h-[108px] rounded-full border pointer-events-none transition-colors ${
              hasError
                ? "border-rose-500/35"
                : "border-[#3B82F6]/60"
            }`}
            animate={
              isActivelyScanning && !shouldReduceMotion
                ? {
                    scale: [1.22, 1.1, 1.01, 1.01, 1.22],
                    opacity: [0.35, 0.65, 0.95, 0.9, 0.35],
                    boxShadow: [
                      "0 0 0px rgba(59, 130, 246, 0)",
                      "0 0 8px rgba(59, 130, 246, 0.2)",
                      "0 0 16px rgba(59, 130, 246, 0.45)",
                      "0 0 12px rgba(59, 130, 246, 0.35)",
                      "0 0 0px rgba(59, 130, 246, 0)",
                    ],
                  }
                : { scale: 1, opacity: hasError ? 0.3 : 0.85, boxShadow: "none" }
            }
            transition={
              isActivelyScanning && !shouldReduceMotion
                ? {
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.25, 0.5, 0.75, 1],
                  }
                : undefined
            }
          >
            {/* 4 subtle precision focus reticle ticks */}
            {!hasError && (
              <>
                <span className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-1 h-1 bg-[#60A5FA] rounded-full opacity-80" />
                <span className="absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 bg-[#60A5FA] rounded-full opacity-80" />
                <span className="absolute top-1/2 -left-[3px] -translate-y-1/2 w-1 h-1 bg-[#60A5FA] rounded-full opacity-80" />
                <span className="absolute top-1/2 -right-[3px] -translate-y-1/2 w-1 h-1 bg-[#60A5FA] rounded-full opacity-80" />
              </>
            )}
          </motion.div>

          {/* Central Lens Core: Gradually clarifies and sharpens into full focus (Phase C) */}
          <motion.div
            animate={
              isActivelyScanning && !shouldReduceMotion
                ? {
                    scale: [0.97, 0.98, 1.0, 1.0, 0.97],
                    opacity: [0.82, 0.92, 1, 1, 0.82],
                    filter: [
                      "blur(0.8px)",
                      "blur(0.3px)",
                      "blur(0px)",
                      "blur(0px)",
                      "blur(0.8px)",
                    ],
                  }
                : { scale: 1, opacity: 1, filter: "blur(0px)" }
            }
            transition={
              isActivelyScanning && !shouldReduceMotion
                ? {
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.25, 0.5, 0.75, 1],
                  }
                : undefined
            }
            className={`relative w-[68px] h-[68px] sm:w-[80px] sm:h-[80px] rounded-full flex items-center justify-center border shadow-md ${
              hasError
                ? "bg-[#121824] border-rose-500/40 text-rose-400"
                : "bg-[#121824] border-[#3B82F6]/35 text-[#3B82F6] shadow-[0_0_24px_-4px_rgba(59,130,246,0.35)]"
            }`}
          >
            {hasError ? (
              <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2]" />
            ) : (
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#3B82F6]/10 border border-[#3B82F6]/25 flex items-center justify-center">
                <Aperture className="w-6 h-6 sm:w-[26px] sm:h-[26px] text-[#3B82F6] stroke-[1.9]" />
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* TITLE: Looking at your website with fresh eyes. */}
        <motion.h1
          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
          className="text-2xl sm:text-3xl font-extrabold text-[#F1F5F9] tracking-tight leading-[1.25] max-w-full"
        >
          Looking at your
          <br />
          website with fresh eyes.
        </motion.h1>

        {/* SUBTITLE / DOMAIN PILL: Clean target URL */}
        {cleanDomain && (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05, ease: EASE_OUT_EXPO }}
            className="mt-3.5 max-w-full px-3.5 py-1 rounded-full bg-[#121824] border border-[#263044]"
          >
            <p
              className="text-xs sm:text-sm font-medium text-[#94A3B8] truncate max-w-[260px] sm:max-w-[380px]"
              title={cleanDomain}
            >
              {cleanDomain}
            </p>
          </motion.div>
        )}

        {/* SUBTLE ANIMATED PROGRESS INDICATOR */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.08, ease: EASE_OUT_EXPO }}
          className="w-full max-w-[260px] sm:max-w-[300px] h-[3px] bg-[#263044] relative overflow-hidden mt-6 mb-7 rounded-full"
          role="progressbar"
          aria-label="Analysis in progress"
          aria-busy={isActivelyScanning}
        >
          {hasError ? (
            <div className="w-full h-full bg-rose-500/80 rounded-full" />
          ) : isBackendReady ? (
            <div className="w-full h-full bg-[#3B82F6] rounded-full" />
          ) : (
            <motion.div
              className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-[#60A5FA] to-[#3B82F6] rounded-full shadow-[0_0_8px_rgba(59,130,246,0.4)]"
              initial={{ x: "-100%" }}
              animate={{ x: "220%" }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}
        </motion.div>

        {/* Single polite screen-reader status */}
        <span className="sr-only" role="status" aria-live="polite">
          {hasError
            ? "Check failed"
            : `Analysis in progress: ${SCAN_STAGES[stageIndex]?.label || "Evaluating clarity"}`}
        </span>

        {/* FOUR SCANNING STAGES CHECKLIST */}
        {!hasError ? (
          <div className="w-full max-w-[280px] sm:max-w-[300px] flex flex-col space-y-3.5 text-left mb-2">
            {SCAN_STAGES.map((stage, idx) => {
              const isCompleted = isBackendReady || idx < stageIndex;
              const isActive = !isBackendReady && idx === stageIndex;

              return (
                <div
                  key={stage.id}
                  className="flex items-center gap-3 transition-colors duration-200"
                >
                  {/* Status Indicator */}
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {isCompleted ? (
                      <div className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[2.8]" />
                      </div>
                    ) : isActive ? (
                      <div className="w-4 h-4 rounded-full bg-[#3B82F6]/15 border border-[#3B82F6]/40 flex items-center justify-center relative">
                        {!shouldReduceMotion && (
                          <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-[#3B82F6] opacity-40" />
                        )}
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3B82F6]" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-[#263044] bg-transparent" />
                    )}
                  </div>

                  {/* Stage Label */}
                  <span
                    className={`text-xs sm:text-sm tracking-wide transition-colors duration-200 ${
                      isCompleted
                        ? "text-[#94A3B8] font-medium"
                        : isActive
                        ? "text-[#F1F5F9] font-semibold"
                        : "text-slate-500 font-normal"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* ERROR STATE: Matches dark theme and clean button controls */}
        <AnimatePresence>
          {hasError && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
              className="w-full mt-2"
            >
              <div className="p-4 bg-[#121824] border border-rose-900/50 rounded-xl mb-4 text-left shadow-lg">
                <p className="text-xs font-semibold tracking-wider text-rose-400 uppercase mb-1">
                  CHECK FAILED
                </p>
                <p className="text-xs text-rose-200/90 leading-relaxed font-normal">
                  {safeErrorMessage}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handleRetryAction}
                  className="flex-1 min-w-[120px] rounded-full bg-[#3B82F6] hover:bg-blue-600 active:scale-[0.98] text-white font-semibold text-xs py-2.5 px-4 transition-all inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Try again</span>
                </button>
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="rounded-full bg-[#121824] hover:bg-[#1A2333] border border-[#263044] text-[#F1F5F9] font-medium text-xs py-2.5 px-4 transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  <span>Change URL</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 3. BOTTOM: The 5 clarity pillars */}
      <footer className="w-full py-6 px-4 text-center shrink-0 border-t border-[#263044]/50">
        <p className="text-xs sm:text-[13px] text-[#94A3B8]/80 font-normal tracking-wide">
          First Impression · Audience · Value · Trust · Action
        </p>
      </footer>
    </div>
  );
}
