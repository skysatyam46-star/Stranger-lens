"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Link2,
  ArrowRight,
  Eye,
  Check,
  X,
  ChevronDown,
  Loader2,
  Shield,
  Users,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import ScanScreen from "@/components/ScanScreen";
import ResultsScreen from "@/components/ResultsScreen";
import { validateClientUrl } from "@/lib/url-client-validator";
import { createScanFlowController } from "@/lib/scan-flow-controller";
import {
  Reveal,
  StaggerContainer,
  StaggerItem,
  AnimatedHamburgerIcon,
  EASE_OUT_EXPO,
} from "@/components/motion/Reveal";
import { LEGAL_CONFIG } from "@/lib/legal-config";

const BRAND_NAME = "StrangerLens";

// Controlled by actual payment availability; remains false until verified Paddle checkout is live
const IS_CHECKOUT_ENABLED = false;

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  paymentLabel: string;
  badge: string | null;
  positioning: string;
  description: string;
  features: string[];
  creditNote?: string;
  cta: string;
  disabledCta: string;
  popular: boolean;
  isPaid: boolean;
}

// PRICING CONFIG (Free and $5 One-Time Full Clarity Report)
const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free Preview",
    price: 0,
    paymentLabel: "FREE",
    badge: null,
    positioning: "Instant clarity evaluation.",
    description: "Discover your overall website clarity score and five signal statuses with zero friction.",
    features: [
      "Overall Website Clarity Score (0–100)",
      "Five Clarity Signal Scores",
      "Five Signal Statuses (Clear / Partly clear / Needs work)",
    ],
    cta: "Analyze My Website Free",
    disabledCta: "Analyze My Website Free",
    popular: false,
    isPaid: false,
  },
  {
    id: "complete",
    name: "Full Clarity Report",
    price: 5,
    paymentLabel: "ONE-TIME PAYMENT",
    badge: "COMPLETE REPORT",
    positioning: "Actionable clarity & diagnostics.",
    description: "Deep dive into what strangers understand, where friction occurs, and how to improve.",
    features: [
      "Everything in Free Preview",
      "Detailed analysis for all five signals",
      "Why This Score? diagnostic reasoning",
      "What's Working? & What's Unclear?",
      "How to Improve? actionable next steps",
      "First 5 Seconds (Understand vs Miss)",
    ],
    cta: "Start with a Free Check",
    disabledCta: "Start with a Free Check",
    popular: true,
    isPaid: true,
  },
];

// REQUIRED FAQ ITEMS
const FAQ_ITEMS = [
  {
    question: "What does StrangerLens analyse?",
    answer:
      "StrangerLens is an AI-powered website first-impression clarity analyzer. It evaluates website communication across five core visitor signals — First Impression, Audience, Value, Trust, and Action — using the content actually inspected from your URL.",
  },
  {
    question: "Does StrangerLens work with any website?",
    answer:
      "StrangerLens works with publicly reachable websites whose text and structure are accessible in the initial HTML response, including SaaS products, developer tools, B2B services, and landing pages.",
  },
  {
    question: "Is the analysis based on real website content?",
    answer:
      "Yes. StrangerLens inspects your live public website URL and extracts visible text, headings, value propositions, and calls to action to ground its findings in your actual inspected content.",
  },
  {
    question: "Is StrangerLens a security, SEO, or human test panel?",
    answer:
      "No. StrangerLens is an AI website first-impression clarity analyzer focused on visitor comprehension, audience alignment, value perception, trust cues, and call-to-action clarity. It does not conduct human usability panels, nor is it a technical SEO or vulnerability scanner.",
  },
  {
    question: "What is included in the free analysis?",
    answer:
      "The Free Preview ($0) gives you your Overall Website Clarity Score, five Clarity Signal Scores (First Impression, Audience, Value, Trust, Action), and five Signal Statuses with zero signup or credit card required.",
  },
  {
    question: "What do paid reports cost?",
    answer:
      "A complete report unlock is a simple $5 one-time payment (no subscriptions or recurring fees). It unlocks detailed analysis for all five signals, Why This Score?, What's Working?, What's Unclear?, How to Improve?, and the First 5 Seconds breakdown (What a Visitor May Understand vs What a Visitor May Miss).",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "No account or signup is required. Enter any public website URL to run an instant analysis.",
  },
];

const NAV_ITEMS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const [currentView, setCurrentView] = useState<"landing" | "scan" | "results">("landing");
  const [submittedUrl, setSubmittedUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeInfoModal, setActiveInfoModal] = useState<"faq" | "pricing" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);

  // API Integration States
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);

  // FAQ accordion state — all answers closed by default
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const hamburgerButtonRef = useRef<HTMLButtonElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const ACTIVE_REPORT_SESSION_KEY = "strangerlens_active_report_v1";

  const clearPersistedReportSession = () => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(ACTIVE_REPORT_SESSION_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const [scanController] = useState(() =>
    createScanFlowController({
      deferResultsNavigation: true,
      onStateChange: (nextState) => {
        setUrl(nextState.url);
        setSubmittedUrl(nextState.submittedUrl);
        setCurrentView(nextState.currentView);
        setIsVerifying(nextState.isVerifying);
        setIsPending(nextState.isPending);
        setErrorMessage(nextState.errorMessage);
        setBackendError(nextState.backendError);
        setAnalysisData(nextState.analysisData);
      },
    })
  );

  function scrollToInput() {
    if (activeInfoModal) setActiveInfoModal(null);
    if (mobileMenuOpen) setMobileMenuOpen(false);
    const wasNotOnLanding = currentView !== "landing";
    if (wasNotOnLanding) {
      clearPersistedReportSession();
      scanController.cancelScan();
    }
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.scrollIntoView({
          behavior: shouldReduceMotion ? "auto" : "smooth",
          block: "center",
        });
        inputRef.current.focus();
      }
    }, wasNotOnLanding ? 180 : 60);
  }



  // Handle Browser Back / Forward and popstate events without unintended rescanning
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Set initial history state if not present
    if (!window.history.state || !window.history.state.strangerLens) {
      const rawSaved = window.sessionStorage.getItem(ACTIVE_REPORT_SESSION_KEY);
      let initialView = "landing";
      if (rawSaved) {
        try {
          const parsed = JSON.parse(rawSaved);
          if (parsed && typeof parsed.analysisData?.score === "number") {
            initialView = "results";
          }
        } catch {
          // ignore
        }
      }
      window.history.replaceState({ strangerLens: true, view: initialView }, "");
    }

    const handlePopState = (event: PopStateEvent) => {
      const histState = event.state;
      const targetView = histState?.view || "landing";

      if (targetView === "landing") {
        // Navigating back to landing: MUST NOT RESCAN
        scanController.navigateToLanding();
      } else if (targetView === "results") {
        // Navigating forward or back to results: MUST NOT RESCAN
        const existingData = scanController.getState().analysisData;
        if (existingData) {
          scanController.navigateToResults();
        } else {
          try {
            const rawSaved = window.sessionStorage.getItem(ACTIVE_REPORT_SESSION_KEY);
            if (rawSaved) {
              const parsed = JSON.parse(rawSaved);
              if (parsed?.analysisData && typeof parsed.analysisData.score === "number") {
                scanController.restoreSession(parsed.rawUrl, parsed.analysisData);
                return;
              }
            }
          } catch {
            // ignore
          }
          scanController.navigateToLanding();
        }
      } else if (targetView === "scan") {
        // If back to scan screen, do not automatically rescan; navigate to landing safely
        scanController.navigateToLanding();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [scanController]);

  // Restore active report from sessionStorage if user refreshed results or returned from legal page
  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId: number | null = null;
    try {
      const rawSaved = window.sessionStorage.getItem(ACTIVE_REPORT_SESSION_KEY);
      if (!rawSaved) return;
      const parsed = JSON.parse(rawSaved);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.rawUrl === "string" &&
        parsed.analysisData &&
        typeof parsed.analysisData.score === "number"
      ) {
        rafId = requestAnimationFrame(() => {
          scanController.restoreSession(
            parsed.rawUrl,
            parsed.analysisData
          );
        });
      }
    } catch {
      // Ignore malformed sessionStorage data
    }
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [scanController]);

  // Persist active report in sessionStorage while viewing results
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (currentView === "results" && analysisData && submittedUrl) {
        window.sessionStorage.setItem(
          ACTIVE_REPORT_SESSION_KEY,
          JSON.stringify({
            rawUrl: submittedUrl,
            analysisData,
            savedAt: Date.now(),
          })
        );
        window.history.replaceState({ strangerLens: true, view: "results" }, "");
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [currentView, analysisData, submittedUrl]);

  const urlValidation = React.useMemo(() => validateClientUrl(url), [url]);



  const handleSectionNavigate = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
    const targetId = href.replace(/^#/, "");
    const element = document.getElementById(targetId);
    if (element) {
      setTimeout(() => {
        element.scrollIntoView({
          behavior: shouldReduceMotion ? "auto" : "smooth",
          block: "start",
        });
      }, mobileMenuOpen ? 120 : 0);
    }
  };

  // Escape key handling for mobile menu and info modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          hamburgerButtonRef.current?.focus();
        }
        if (activeInfoModal) {
          setActiveInfoModal(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen, activeInfoModal]);

  // Close mobile overlay automatically on desktop resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mobileMenuOpen]);

  // Prevent background scrolling when mobile menu or modal is open
  useEffect(() => {
    if (mobileMenuOpen || activeInfoModal) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileMenuOpen, activeInfoModal]);

  const handleAnalyze = async (e?: React.FormEvent, overrideUrl?: string) => {
    if (e) e.preventDefault();
    if (typeof window !== "undefined") {
      window.history.pushState({ strangerLens: true, view: "scan" }, "");
    }
    await scanController.startScan(overrideUrl);
    if (scanController.getState().errorMessage) {
      if (typeof window !== "undefined") {
        window.history.replaceState({ strangerLens: true, view: "landing" }, "");
      }
      scrollToInput();
    }
  };

  return (
    <div className="min-h-screen bg-[#090D15] text-[#F1F5F9] font-sans antialiased selection:bg-[#3B82F6]/30 selection:text-white flex flex-col overflow-x-hidden">
      <AnimatePresence mode="wait">
        {currentView === "landing" ? (
          <motion.div
            key="landing"
            initial={shouldReduceMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? {} : { opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="w-full min-h-screen flex flex-col bg-[#090D15] text-[#F1F5F9]"
          >
            {/* STICKY HEADER */}
            <motion.header
              initial={shouldReduceMotion ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
              className="w-full bg-[#090D15]/85 backdrop-blur-md border-b border-[#263044] sticky top-0 z-50 transition-colors"
            >
              <div className="max-w-[1180px] mx-auto px-4 sm:px-6 md:px-8 h-[64px] sm:h-[72px] flex items-center justify-between gap-2 sm:gap-4">
                <a
                  href="#"
                  aria-label="StrangerLens home"
                  onClick={(e) => {
                    e.preventDefault();
                    if (mobileMenuOpen) setMobileMenuOpen(false);
                    window.scrollTo({
                      top: 0,
                      behavior: shouldReduceMotion ? "auto" : "smooth",
                    });
                  }}
                  className="flex items-center gap-2 sm:gap-2.5 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] rounded-lg"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#171F2D] border border-[#263044] text-white flex items-center justify-center font-bold text-sm tracking-tighter shadow-xs transition-transform duration-200 group-hover:scale-[1.04]">
                    S
                  </div>
                  <span className="text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap">
                    StrangerLens
                  </span>
                </a>

                {/* Desktop Navigation */}
                <nav
                  aria-label="Primary Navigation"
                  className="hidden md:flex items-center gap-8 text-sm font-medium text-[#94A3B8]"
                >
                  {NAV_ITEMS.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={(e) => handleSectionNavigate(e, item.href)}
                      className="relative py-1 hover:text-white transition-colors whitespace-nowrap shrink-0 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-[#3B82F6] after:rounded-full after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] rounded"
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>

                <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                  <button
                    onClick={scrollToInput}
                    className="group rounded-full bg-[#246BFD] hover:bg-blue-600 active:scale-[0.97] text-white text-xs sm:text-sm font-medium px-4 sm:px-5 py-2 sm:py-2.5 transition-all duration-200 inline-flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] focus-visible:ring-offset-2"
                  >
                    <span>Try for free</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>

                  <button
                    ref={hamburgerButtonRef}
                    type="button"
                    onClick={() => setMobileMenuOpen((prev) => !prev)}
                    className="md:hidden w-10 h-10 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#171F2D] active:scale-95 transition-all flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD]"
                    aria-label={
                      mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
                    }
                    aria-expanded={mobileMenuOpen}
                    aria-controls="mobile-navigation-overlay"
                  >
                    <AnimatedHamburgerIcon
                      isOpen={mobileMenuOpen}
                      reducedMotion={!!shouldReduceMotion}
                    />
                  </button>
                </div>
              </div>
            </motion.header>

            {/* MOBILE HAMBURGER MENU — FIXED BLURRED OVERLAY (DOES NOT PUSH CONTENT) */}
            <AnimatePresence>
              {mobileMenuOpen && (
                <div
                  id="mobile-navigation-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Mobile Navigation"
                  className="fixed inset-0 top-[64px] sm:top-[72px] z-40 md:hidden flex flex-col"
                >
                  {/* Blurred & Dimmed Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: shouldReduceMotion ? 0.05 : 0.25,
                      ease: "easeOut",
                    }}
                    onClick={() => setMobileMenuOpen(false)}
                    className="fixed inset-0 top-[64px] sm:top-[72px] bg-black/60 backdrop-blur-[16px] [-webkit-backdrop-filter:blur(16px)]"
                  />

                  {/* Translucent Floating Menu Surface */}
                  <motion.div
                    initial={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -14, scale: 0.985 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -10, scale: 0.985 }
                    }
                    transition={{
                      duration: shouldReduceMotion ? 0.05 : 0.32,
                      ease: EASE_OUT_EXPO,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative z-10 w-full bg-[#121824]/95 backdrop-blur-2xl border-b border-[#263044] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] rounded-b-3xl px-5 pt-4 pb-6 overflow-y-auto max-h-[calc(100dvh-64px)] text-[#F1F5F9]"
                  >
                    <motion.nav
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      variants={{
                        hidden: {},
                        visible: {
                          transition: {
                            staggerChildren: shouldReduceMotion ? 0 : 0.05,
                            delayChildren: shouldReduceMotion ? 0 : 0.04,
                          },
                        },
                      }}
                      aria-label="Mobile Navigation"
                      className="flex flex-col space-y-1"
                    >
                      {NAV_ITEMS.map((item) => (
                        <motion.a
                          key={item.href}
                          href={item.href}
                          onClick={(e) => handleSectionNavigate(e, item.href)}
                          variants={{
                            hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.28, ease: EASE_OUT_EXPO },
                            },
                          }}
                          className="group flex items-center justify-between min-h-[48px] px-4 py-3 rounded-2xl text-base font-semibold text-[#F1F5F9] hover:bg-[#171F2D] active:bg-[#1C2638] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD]"
                        >
                          <span>{item.label}</span>
                          <ArrowRight className="w-4 h-4 text-[#64748B] group-hover:text-[#3B82F6] group-hover:translate-x-0.5 transition-all" />
                        </motion.a>
                      ))}

                      <motion.div
                        variants={{
                          hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 12 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            transition: {
                              duration: 0.32,
                              delay: shouldReduceMotion ? 0 : 0.04,
                              ease: EASE_OUT_EXPO,
                            },
                          },
                        }}
                        className="pt-3 mt-2 border-t border-[#263044]"
                      >
                        <button
                          type="button"
                          onClick={scrollToInput}
                          className="group w-full min-h-[48px] rounded-full bg-[#246BFD] hover:bg-blue-600 active:scale-[0.98] text-white text-sm font-semibold px-6 py-3 transition-all inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] focus-visible:ring-offset-2"
                        >
                          <span>Try for free</span>
                          <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </button>

                        <div className="pt-3 mt-3 border-t border-[#263044] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-[#94A3B8]">
                          {LEGAL_CONFIG.links.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setMobileMenuOpen(false)}
                              className="hover:text-white transition-colors"
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </motion.div>
                    </motion.nav>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 md:px-8">
              {/* HERO SECTION — Side-by-side two-column layout on desktop, stacked on mobile */}
              <section className="pt-7 pb-11 sm:pt-12 sm:pb-16 md:pt-14 md:pb-18 lg:pt-20 lg:pb-22 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 sm:gap-10 lg:gap-12 items-center">
                <div className="w-full flex flex-col items-start text-left min-w-0">
                  {/* 1. Eyebrow with subtle blur-to-sharp entrance */}
                  <motion.div
                    initial={
                      shouldReduceMotion
                        ? false
                        : { opacity: 0, y: 8, filter: "blur(4px)" }
                    }
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{
                      duration: 0.5,
                      delay: 0.05,
                      ease: EASE_OUT_EXPO,
                    }}
                    className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wider text-[#3B82F6] uppercase bg-[#171F2D] mb-4 sm:mb-5 border border-[#263044]"
                  >
                    AI WEBSITE FIRST-IMPRESSION ANALYZER
                  </motion.div>

                  {/* 2. Staggered Hero Headline Lines */}
                  <h1 className="text-[32px] min-[375px]:text-4xl sm:text-5xl lg:text-[54px] font-extrabold text-white tracking-tight leading-[1.09] mb-4 sm:mb-5 [text-wrap:balance]">
                    <motion.span
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.52,
                        delay: 0.11,
                        ease: EASE_OUT_EXPO,
                      }}
                      className="block"
                    >
                      Does Your Website
                    </motion.span>
                    <motion.span
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.54,
                        delay: 0.2,
                        ease: EASE_OUT_EXPO,
                      }}
                      className="block"
                    >
                      Make Sense to a{" "}
                      <span className="text-[#3B82F6]">Stranger?</span>
                    </motion.span>
                  </h1>

                  {/* 3. Supporting Text */}
                  <motion.p
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.52,
                      delay: 0.3,
                      ease: EASE_OUT_EXPO,
                    }}
                    className="text-[15px] sm:text-lg text-[#94A3B8] leading-relaxed mb-6 sm:mb-7 max-w-lg font-normal"
                  >
                    See your website through a stranger&apos;s eyes. Get an AI-powered first-impression clarity review to uncover what&apos;s clear, what confuses first-time visitors, and how to improve.
                  </motion.p>

                  {/* 4. URL Input Pill & Primary Hero CTA */}
                  <motion.form
                    onSubmit={handleAnalyze}
                    initial={
                      shouldReduceMotion
                        ? false
                        : { opacity: 0, y: 14, scale: 0.975 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: 0.55,
                      delay: 0.38,
                      ease: EASE_OUT_EXPO,
                    }}
                    className="w-full max-w-lg"
                  >
                    <div
                      className={`relative flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch lg:items-center bg-[#121824] rounded-3xl sm:rounded-full md:rounded-3xl lg:rounded-full border transition-all duration-200 p-2 sm:p-1.5 sm:pl-5 md:p-2 lg:p-1.5 lg:pl-5 ${
                        errorMessage || urlValidation.status === "invalid"
                          ? "border-rose-500 ring-4 ring-rose-500/20 shadow-sm"
                          : urlValidation.status === "valid"
                          ? "border-emerald-500 ring-4 ring-emerald-500/20 shadow-md"
                          : isInputFocused
                          ? "border-[#3B82F6] ring-4 ring-blue-500/20 shadow-[0_10px_30px_-6px_rgba(59,130,246,0.3)]"
                          : "border-[#263044] hover:border-[#384660] shadow-[0_8px_26px_-6px_rgba(0,0,0,0.4)]"
                      }`}
                    >
                      <div className="flex items-center flex-1 min-w-0 px-2.5 sm:px-0 md:px-2.5 lg:px-0 min-h-[44px] sm:min-h-[46px]">
                        <Link2
                          className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 mr-2.5 sm:mr-3 transition-colors duration-200 ${
                            isInputFocused ? "text-[#3B82F6]" : "text-[#64748B]"
                          }`}
                        />
                        <input
                          ref={inputRef}
                          type="text"
                          disabled={isVerifying || isPending}
                          value={url}
                          onFocus={() => setIsInputFocused(true)}
                          onBlur={() => setIsInputFocused(false)}
                          onChange={(e) => {
                            scanController.setUrl(e.target.value);
                          }}
                          placeholder="https://yourwebsite.com"
                          className="w-full min-w-0 bg-transparent text-white placeholder:text-[#64748B] text-sm sm:text-base outline-none font-normal pr-2 disabled:opacity-75"
                          aria-label="Website URL"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={
                          isVerifying || isPending || urlValidation.status === "invalid"
                        }
                        className={`group mt-1.5 sm:mt-0 md:mt-1.5 lg:mt-0 w-full sm:w-auto md:w-full lg:w-auto min-h-[44px] sm:min-h-[46px] px-4 sm:px-5 py-2.5 rounded-full font-semibold text-xs sm:text-[13px] flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] focus-visible:ring-offset-2 ${
                          urlValidation.status === "invalid"
                            ? "bg-[#171F2D] text-[#64748B] cursor-not-allowed shadow-none border border-[#263044]"
                            : isVerifying
                            ? "bg-[#246BFD] text-white opacity-90 cursor-wait"
                            : "bg-[#246BFD] hover:bg-blue-600 active:scale-[0.98] text-white shadow-md shadow-blue-500/25"
                        }`}
                        aria-label="Analyze My Website Free"
                      >
                        {isVerifying && (
                          <Loader2 className="w-4 h-4 animate-spin text-white shrink-0" />
                        )}
                        <span>Analyze My Website Free →</span>
                      </button>
                    </div>

                    <AnimatePresence mode="wait">
                      {(errorMessage || urlValidation.status === "invalid") && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2 }}
                          className="text-rose-400 text-xs sm:text-sm mt-2 font-medium pl-2"
                        >
                          {errorMessage || urlValidation.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.form>

                  {/* 5. Concise Truthful Reassurance Line */}
                  <motion.p
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: 0.46,
                      ease: EASE_OUT_EXPO,
                    }}
                    className="mt-3.5 text-xs sm:text-[13px] text-[#94A3B8] font-medium leading-relaxed"
                  >
                    No signup required · AI-powered clarity review · Five clarity signals
                  </motion.p>
                </div>

                {/* 6. Right Column — Final Product Report Preview */}
                <motion.div
                  initial={
                    shouldReduceMotion
                      ? false
                      : { opacity: 0, y: 22, scale: 0.98 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: 0.65,
                    delay: 0.24,
                    ease: EASE_OUT_EXPO,
                  }}
                  className="w-full min-w-0 flex justify-center md:justify-end"
                >
                  <div className="w-full bg-[#121824] border border-[#263044] rounded-3xl p-4 sm:p-6 shadow-[0_20px_50px_-15px_rgba(9,13,21,0.5)] text-[#F1F5F9]">
                    {/* A. Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#263044] mb-3.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-[#3B82F6]/15 text-[#3B82F6] flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-extrabold text-[#F1F5F9] text-sm sm:text-base tracking-tight block">
                            Your Website Clarity
                          </span>
                          <span className="text-[11px] text-[#94A3B8] font-medium block">
                            Illustrative Preview · V1 Report
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3B82F6] bg-[#3B82F6]/10 px-3 py-1 rounded-full shrink-0 border border-[#3B82F6]/20">
                        Overall Score: 78/100 · Clear
                      </span>
                    </div>

                    {/* B. Five Clarity Signals in Preview */}
                    <div className="space-y-2 mb-3.5">
                      {[
                        { label: "First Impression", score: 85, status: "Clear", color: "bg-emerald-500", text: "text-emerald-400" },
                        { label: "Audience", score: 80, status: "Clear", color: "bg-emerald-500", text: "text-emerald-400" },
                        { label: "Value", score: 72, status: "Partly clear", color: "bg-amber-400", text: "text-amber-400" },
                        { label: "Trust", score: 68, status: "Partly clear", color: "bg-amber-400", text: "text-amber-400" },
                        { label: "Action", score: 85, status: "Clear", color: "bg-emerald-500", text: "text-emerald-400" },
                      ].map((sig) => (
                        <div
                          key={sig.label}
                          className="bg-[#171F2D] border border-[#263044] rounded-xl px-3 py-2 flex flex-col gap-1.5 transition-colors hover:border-[#384660]"
                        >
                          <div className="flex items-center justify-between text-xs sm:text-[13px]">
                            <span className="font-semibold text-[#F1F5F9] truncate">{sig.label}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[11px] sm:text-xs font-semibold ${sig.text}`}>
                                {sig.status}
                              </span>
                              <span className="text-[11px] sm:text-xs font-bold text-white/90 tabular-nums">
                                {sig.score}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-[#263044] h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${sig.color}`}
                              style={{ width: `${sig.score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* C. Premium Preview Area (Why This Score, What's Working, Unclear, First 5 Seconds) */}
                    <div className="rounded-2xl bg-[#171F2D] border border-[#263044] p-3 sm:p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between font-semibold border-b border-[#263044] pb-2 text-[11px] sm:text-xs">
                        <span className="text-[#94A3B8]">Paid Report Sections</span>
                        <span className="text-[#3B82F6] font-bold">Unlocked with $5 One-Time</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-0.5 text-[11px] sm:text-xs text-[#F1F5F9]">
                        <div className="bg-[#121824] border border-[#263044] rounded-lg p-2 sm:p-2.5">
                          <span className="font-bold text-[#3B82F6] block mb-0.5">Why This Score?</span>
                          <span className="text-[#94A3B8] text-[10px] sm:text-[11px] leading-tight block">Deep signal rationale</span>
                        </div>
                        <div className="bg-[#121824] border border-[#263044] rounded-lg p-2 sm:p-2.5">
                          <span className="font-bold text-emerald-400 block mb-0.5">What{"'"}s Working?</span>
                          <span className="text-[#94A3B8] text-[10px] sm:text-[11px] leading-tight block">Strong visitor cues</span>
                        </div>
                        <div className="bg-[#121824] border border-[#263044] rounded-lg p-2 sm:p-2.5">
                          <span className="font-bold text-amber-400 block mb-0.5">What{"'"}s Unclear?</span>
                          <span className="text-[#94A3B8] text-[10px] sm:text-[11px] leading-tight block">Friction &amp; doubt points</span>
                        </div>
                        <div className="bg-[#121824] border border-[#263044] rounded-lg p-2 sm:p-2.5">
                          <span className="font-bold text-[#3B82F6] block mb-0.5">First 5 Seconds</span>
                          <span className="text-[#94A3B8] text-[10px] sm:text-[11px] leading-tight block">Understand vs Miss</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </section>

              {/* SECTION: HOW IT WORKS (3 Steps) */}
              <section
                id="how-it-works"
                className="scroll-mt-20 sm:scroll-mt-24 py-12 sm:py-14 md:py-20 border-t border-[#263044]"
              >
                <div className="max-w-4xl mx-auto text-center mb-8 sm:mb-10 md:mb-12">
                  <Reveal y={10} blur>
                    <span className="inline-block text-[11px] font-bold tracking-widest text-[#3B82F6] uppercase bg-[#171F2D] px-3 py-1 rounded-full border border-[#263044]">
                      HOW IT WORKS
                    </span>
                  </Reveal>
                  <Reveal y={14} delay={0.06}>
                    <h2 className="text-2xl min-[375px]:text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-3.5 mb-3 [text-wrap:balance]">
                      Three simple steps to clarity.
                    </h2>
                  </Reveal>
                  <Reveal y={14} delay={0.12}>
                    <p className="text-[15px] sm:text-lg text-[#94A3B8] max-w-2xl mx-auto leading-relaxed font-normal">
                      See your website through a stranger&apos;s eyes.
                    </p>
                  </Reveal>
                </div>

                <StaggerContainer
                  staggerDelay={0.08}
                  className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 max-w-4xl mx-auto items-stretch"
                >
                  <StaggerItem y={16} className="h-full min-w-0">
                    <div className="h-full bg-[#121824] border border-[#263044] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-lg hover:border-[#384660] transition-all">
                      <div>
                        <div className="w-10 h-10 rounded-2xl bg-[#171F2D] text-[#3B82F6] border border-[#263044] flex items-center justify-center font-extrabold text-sm mb-4">
                          01
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">
                          Enter your website
                        </h3>
                        <p className="text-sm text-[#94A3B8] leading-relaxed">
                          Add the public URL you want analyzed. No signup or account required to start.
                        </p>
                      </div>
                    </div>
                  </StaggerItem>

                  <StaggerItem y={16} className="h-full min-w-0">
                    <div className="h-full bg-[#121824] border border-[#263044] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-lg hover:border-[#384660] transition-all">
                      <div>
                        <div className="w-10 h-10 rounded-2xl bg-[#171F2D] text-[#3B82F6] border border-[#263044] flex items-center justify-center font-extrabold text-sm mb-4">
                          02
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">
                          Get free clarity signals
                        </h3>
                        <p className="text-sm text-[#94A3B8] leading-relaxed">
                          Discover your overall score and five first-impression signals evaluating core communication.
                        </p>
                      </div>
                    </div>
                  </StaggerItem>

                  <StaggerItem y={16} className="h-full min-w-0">
                    <div className="h-full bg-[#121824] border border-[#263044] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-lg hover:border-[#384660] transition-all">
                      <div>
                        <div className="w-10 h-10 rounded-2xl bg-[#171F2D] text-[#3B82F6] border border-[#263044] flex items-center justify-center font-extrabold text-sm mb-4">
                          03
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">
                          Explore the details
                        </h3>
                        <p className="text-sm text-[#94A3B8] leading-relaxed">
                          Unlock deep signal analyses, improvements, and First 5 Seconds with a $5 one-time report.
                        </p>
                      </div>
                    </div>
                  </StaggerItem>
                </StaggerContainer>
              </section>

              {/* SECTION: FIVE CLARITY SIGNALS (Compact & Sleek) */}
              <section
                id="product"
                className="scroll-mt-20 sm:scroll-mt-24 py-10 sm:py-12 md:py-16 border-t border-[#263044]"
              >
                <div className="max-w-4xl mx-auto text-center mb-6 sm:mb-8">
                  <Reveal y={10} blur>
                    <span className="inline-block text-[11px] font-bold tracking-widest text-[#3B82F6] uppercase bg-[#171F2D] px-3 py-1 rounded-full border border-[#263044]">
                      FIVE CLARITY SIGNALS
                    </span>
                  </Reveal>
                  <Reveal y={14} delay={0.06}>
                    <h2 className="text-2xl min-[375px]:text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-3 mb-2 [text-wrap:balance]">
                      Five signals. One clearer picture.
                    </h2>
                  </Reveal>
                  <Reveal y={14} delay={0.12}>
                    <p className="text-sm sm:text-base text-[#94A3B8] max-w-2xl mx-auto leading-relaxed font-normal">
                      Every signal evaluates how your website communicates essential visitor expectations.
                    </p>
                  </Reveal>
                </div>

                <StaggerContainer
                  staggerDelay={0.06}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-3.5 max-w-6xl mx-auto items-stretch"
                >
                  {[
                    {
                      title: "FIRST IMPRESSION",
                      desc: "Can visitors understand what your website offers?",
                      icon: Eye,
                    },
                    {
                      title: "AUDIENCE",
                      desc: "Is it clear who your website is intended for?",
                      icon: Users,
                    },
                    {
                      title: "VALUE",
                      desc: "Can visitors recognize the main benefit?",
                      icon: Sparkles,
                    },
                    {
                      title: "TRUST",
                      desc: "Can visitors understand the basis of important claims?",
                      icon: Shield,
                    },
                    {
                      title: "ACTION",
                      desc: "Is the next step clear?",
                      icon: ArrowRight,
                    },
                  ].map((card, idx) => {
                    const IconComponent = card.icon;
                    return (
                      <StaggerItem key={idx} y={14} className="h-full">
                        <div className="group h-full bg-[#121824] border border-[#263044] rounded-2xl p-4 sm:p-4.5 flex flex-col justify-between shadow-md hover:border-[#384660] md:hover:-translate-y-1 hover:shadow-xl transition-all duration-200">
                          <div>
                            <div className="w-8 h-8 rounded-xl bg-[#171F2D] border border-[#263044] text-[#3B82F6] flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-105 group-hover:bg-[#1C2638]">
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <h3 className="font-extrabold text-white text-xs tracking-wider uppercase mb-1">
                              {card.title}
                            </h3>
                            <p className="text-xs text-[#94A3B8] leading-relaxed">
                              {card.desc}
                            </p>
                          </div>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </StaggerContainer>
              </section>

              {/* SECTION: PRICING */}
              <section
                id="pricing"
                className="scroll-mt-20 sm:scroll-mt-24 py-12 sm:py-14 md:py-20 border-t border-[#263044]"
              >
                <div className="max-w-4xl mx-auto text-center mb-8 sm:mb-10 md:mb-12">
                  <Reveal y={10} blur>
                    <span className="inline-block text-[11px] font-bold tracking-widest text-[#3B82F6] uppercase bg-[#171F2D] px-3 py-1 rounded-full border border-[#263044]">
                      PRICING
                    </span>
                  </Reveal>
                  <Reveal y={14} delay={0.06}>
                    <h2 className="text-2xl min-[375px]:text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-3.5 mb-3 [text-wrap:balance]">
                      Simple, transparent pricing.
                    </h2>
                  </Reveal>
                  <Reveal y={14} delay={0.12}>
                    <p className="text-[15px] sm:text-lg text-[#94A3B8] max-w-2xl mx-auto leading-relaxed font-normal">
                      Start with a free clarity preview today. Unlock the complete report with a one-time payment — no subscriptions or hidden fees.
                    </p>
                  </Reveal>
                </div>

                <StaggerContainer
                  staggerDelay={0.09}
                  className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 max-w-3xl mx-auto pt-3 items-stretch"
                >
                  {PRICING_PLANS.map((plan) => {
                    const isPaidPreLaunch = plan.isPaid && !IS_CHECKOUT_ENABLED;
                    return (
                      <StaggerItem key={plan.id} y={20} className="h-full">
                        <div
                          className={`h-full rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-200 relative ${
                            plan.popular
                              ? "bg-[#121824] border-2 border-[#3B82F6] shadow-[0_0_40px_rgba(36,107,253,0.18)] md:-translate-y-1.5 md:hover:-translate-y-2"
                              : "bg-[#121824] border border-[#263044] shadow-lg hover:border-[#384660] md:hover:-translate-y-1 hover:shadow-2xl"
                          }`}
                        >
                          {plan.badge && (
                            <motion.div
                              initial={
                                shouldReduceMotion
                                  ? false
                                  : { opacity: 0, scale: 0.92, y: 4 }
                              }
                              whileInView={{ opacity: 1, scale: 1, y: 0 }}
                              viewport={{ once: true }}
                              transition={{
                                duration: 0.35,
                                delay: 0.18,
                                ease: EASE_OUT_EXPO,
                              }}
                              className="absolute -top-3.5 left-6 right-6 flex items-center justify-between gap-2 pointer-events-none"
                            >
                              <span
                                className={`text-[10px] font-extrabold tracking-wider uppercase px-3 py-1 rounded-full shadow-sm whitespace-nowrap ${
                                  plan.popular
                                    ? "bg-[#246BFD] text-white"
                                    : "bg-emerald-600 text-white"
                                }`}
                              >
                                {plan.badge}
                              </span>
                            </motion.div>
                          )}

                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h3 className="font-extrabold text-white text-xl tracking-tight">
                                {plan.name}
                              </h3>
                            </div>

                            <p className="text-sm font-bold text-[#3B82F6] mb-1">
                              {plan.positioning}
                            </p>
                            <p className="text-xs sm:text-[13px] text-[#94A3B8] leading-relaxed mb-5">
                              {plan.description}
                            </p>

                            <div className="flex items-baseline gap-2 mb-5 pb-4 border-b border-[#263044] tabular-nums">
                              <span className="text-4xl sm:text-[42px] font-extrabold text-white tracking-tight leading-none">
                                ${plan.price}
                              </span>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                                {plan.paymentLabel}
                              </span>
                            </div>

                            <div className="mb-6">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#64748B] block mb-3">
                                Includes:
                              </span>
                              <ul className="space-y-2.5 text-sm text-[#F1F5F9]">
                                {plan.features.map((feat, i) => (
                                  <li key={i} className="flex items-start gap-2.5">
                                    <Check
                                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                                        plan.popular
                                          ? "text-[#3B82F6]"
                                          : "text-emerald-400"
                                      }`}
                                    />
                                    <span className="leading-snug">{feat}</span>
                                  </li>
                                ))}
                              </ul>
                              {plan.creditNote && (
                                <p className="mt-3.5 pt-3 border-t border-[#263044] text-[11px] text-[#94A3B8] leading-relaxed">
                                  {plan.creditNote}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={scrollToInput}
                            className={`group w-full min-h-[46px] py-3 px-4 rounded-full text-sm font-semibold transition-all duration-200 inline-flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] focus-visible:ring-offset-2 ${
                              plan.popular || !plan.isPaid
                                ? "bg-[#246BFD] hover:bg-blue-600 active:scale-[0.98] text-white shadow-md shadow-blue-500/20"
                                : "bg-[#171F2D] hover:bg-[#1C2638] active:scale-[0.98] text-white border border-[#263044]"
                            }`}
                          >
                            <span>
                              {isPaidPreLaunch ? plan.disabledCta : plan.cta} →
                            </span>
                          </button>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </StaggerContainer>

                <Reveal y={12} delay={0.16}>
                  <div className="max-w-3xl mx-auto mt-8 text-center text-xs text-[#94A3B8] space-y-1.5">
                    <p className="font-semibold text-white">
                      One-time payment · No subscription
                    </p>
                    <p className="text-xs text-[#94A3B8] flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                      <Link
                        href="/terms"
                        className="text-[#94A3B8] hover:text-[#3B82F6] underline underline-offset-2 transition-colors"
                      >
                        Terms
                      </Link>
                      <span aria-hidden="true">·</span>
                      <Link
                        href="/privacy"
                        className="text-[#94A3B8] hover:text-[#3B82F6] underline underline-offset-2 transition-colors"
                      >
                        Privacy
                      </Link>
                      <span aria-hidden="true">·</span>
                      <Link
                        href="/refund-policy"
                        className="text-[#94A3B8] hover:text-[#3B82F6] underline underline-offset-2 transition-colors"
                      >
                        Refund Policy
                      </Link>
                      <span aria-hidden="true">·</span>
                      <Link
                        href="/contact"
                        className="text-[#94A3B8] hover:text-[#3B82F6] underline underline-offset-2 transition-colors"
                      >
                        Contact Support
                      </Link>
                    </p>
                  </div>
                </Reveal>
              </section>

              {/* SECTION: FAQ */}
              <section
                id="faq"
                className="scroll-mt-20 sm:scroll-mt-24 py-12 sm:py-14 md:py-20 border-t border-[#263044] max-w-3xl mx-auto px-1 sm:px-4"
              >
                <div className="text-center mb-8 sm:mb-10">
                  <Reveal y={10} blur>
                    <span className="inline-block text-[11px] font-bold tracking-widest text-[#3B82F6] uppercase bg-[#171F2D] px-3 py-1 rounded-full border border-[#263044]">
                      FAQ
                    </span>
                  </Reveal>
                  <Reveal y={14} delay={0.06}>
                    <h2 className="text-2xl min-[375px]:text-3xl font-extrabold text-white tracking-tight mt-3.5 [text-wrap:balance]">
                      Frequently asked questions
                    </h2>
                  </Reveal>
                </div>

                <Reveal y={16} delay={0.1}>
                  <div className="divide-y divide-[#263044] border-t border-[#263044]">
                    {FAQ_ITEMS.map((item, idx) => {
                      const isOpen = openFaqIndex === idx;
                      const answerId = `faq-answer-${idx}`;
                      return (
                        <div key={idx} className="py-3.5 sm:py-4">
                          <button
                            type="button"
                            onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                            className="w-full flex items-center justify-between gap-4 text-left py-1.5 group cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] rounded-lg"
                            aria-expanded={isOpen}
                            aria-controls={answerId}
                          >
                            <span className="font-bold text-[#F1F5F9] group-hover:text-[#3B82F6] transition-colors text-[15px] sm:text-base">
                              {item.question}
                            </span>
                            <ChevronDown
                              className={`w-5 h-5 text-[#64748B] shrink-0 transition-transform duration-200 ${
                                isOpen
                                  ? "rotate-180 text-[#3B82F6]"
                                  : "group-hover:text-white"
                              }`}
                            />
                          </button>
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                id={answerId}
                                initial={
                                  shouldReduceMotion
                                    ? false
                                    : { height: 0, opacity: 0 }
                                }
                                animate={{ height: "auto", opacity: 1 }}
                                exit={
                                  shouldReduceMotion
                                    ? { opacity: 0 }
                                    : { height: 0, opacity: 0 }
                                }
                                transition={{
                                  duration: shouldReduceMotion ? 0.05 : 0.26,
                                  ease: EASE_OUT_EXPO,
                                }}
                                className="overflow-hidden"
                              >
                                <p className="pt-2 pb-1 text-sm text-[#94A3B8] leading-relaxed">
                                  {item.answer}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </Reveal>
              </section>

              {/* FINAL CTA & FOOTER */}
              <section className="pt-11 pb-8 sm:pt-14 sm:pb-10 md:pt-20 md:pb-12 border-t border-[#263044] text-center">
                <Reveal y={18}>
                  <div className="max-w-4xl mx-auto rounded-3xl bg-gradient-to-b from-[#121824] to-[#171F2D] border border-[#263044] p-7 sm:p-10 md:p-14 mb-8 sm:mb-10 shadow-2xl">
                    <h2 className="text-2xl min-[375px]:text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3.5 [text-wrap:balance]">
                      Does Your Website Make Sense to a Stranger?
                    </h2>
                    <p className="text-[15px] sm:text-base text-[#94A3B8] max-w-xl mx-auto mb-6 sm:mb-7 font-normal">
                      See your website through a stranger&apos;s eyes before your next visitor leaves.
                    </p>
                    <button
                      onClick={scrollToInput}
                      className="group rounded-full bg-[#246BFD] hover:bg-blue-600 active:scale-[0.98] text-white font-medium px-7 sm:px-8 py-3.5 sm:py-4 inline-flex items-center gap-2 shadow-md shadow-blue-500/25 transition-all duration-200 cursor-pointer text-sm sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] focus-visible:ring-offset-2"
                    >
                      <span>Analyze My Website Free →</span>
                    </button>
                  </div>
                </Reveal>

                <Reveal y={10} delay={0.08}>
                  <footer className="pt-6 pb-4 border-t border-[#263044] flex flex-col gap-5 text-xs text-[#94A3B8]">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#171F2D] border border-[#263044] text-white flex items-center justify-center text-xs font-bold shrink-0">
                          S
                        </div>
                        <span className="font-bold text-white whitespace-nowrap">
                          {BRAND_NAME}
                        </span>
                        <span>
                          © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-6">
                        {NAV_ITEMS.map((item) => (
                          <a
                            key={item.href}
                            href={item.href}
                            onClick={(e) => handleSectionNavigate(e, item.href)}
                            className="hover:text-white transition-colors underline-offset-4 hover:underline"
                          >
                            {item.label}
                          </a>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] sm:text-xs text-[#94A3B8]">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2">
                        {LEGAL_CONFIG.links.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="hover:text-white transition-colors underline-offset-4 hover:underline font-medium"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                      <div className="text-center sm:text-right text-[11px] text-[#64748B]">
                        <span>Support: </span>
                        <a
                          href={`mailto:${LEGAL_CONFIG.supportEmail}`}
                          className="text-[#94A3B8] hover:text-[#3B82F6] transition-colors font-medium"
                        >
                          {LEGAL_CONFIG.supportEmail}
                        </a>
                      </div>
                    </div>
                  </footer>
                </Reveal>
              </section>
            </main>
          </motion.div>
        ) : currentView === "scan" ? (
          <motion.div
            key="scan"
            initial={shouldReduceMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? {} : { opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="w-full min-h-screen bg-[#090D15]"
          >
            <ScanScreen
              rawUrl={submittedUrl}
              isBackendReady={!isPending && !isVerifying && analysisData !== null}
              isScanning={isPending || isVerifying}
              backendError={backendError}
              onRetry={() => {
                scanController.retryScan();
              }}
              onCancel={() => {
                scanController.cancelScan();
                if (typeof window !== "undefined") {
                  window.history.replaceState({ strangerLens: true, view: "landing" }, "");
                }
              }}
              onBackToLanding={() => {
                scanController.cancelScan();
                if (typeof window !== "undefined") {
                  window.history.replaceState({ strangerLens: true, view: "landing" }, "");
                }
                setTimeout(() => scrollToInput(), 100);
              }}
              onOpenFaq={() => {
                setOpenFaqIndex(null);
                setActiveInfoModal("faq");
              }}
              onOpenPricing={() => setActiveInfoModal("pricing")}
              onGoToResults={() => {
                scanController.completeScanToResults();
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={shouldReduceMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? {} : { opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full min-h-screen bg-[#090D15]"
          >
            <ResultsScreen
              rawUrl={submittedUrl}
              analysisData={analysisData || undefined}
              onBackToLanding={() => {
                // Logo/Home navigation: return to landing page without scanning
                scanController.navigateToLanding();
                if (typeof window !== "undefined") {
                  window.history.pushState({ strangerLens: true, view: "landing" }, "");
                }
                window.scrollTo({
                  top: 0,
                  behavior: shouldReduceMotion ? "auto" : "smooth",
                });
              }}
              onRunNewCheck={() => {
                // New Check: navigate to clean URL input screen, NEVER start scanning
                clearPersistedReportSession();
                scanController.resetToLanding(true);
                if (typeof window !== "undefined") {
                  window.history.pushState({ strangerLens: true, view: "landing" }, "");
                }
                setTimeout(() => {
                  scrollToInput();
                }, 60);
              }}
              onRecheck={() => {
                // Recheck Website: explicitly start exactly ONE new scan
                if (typeof window !== "undefined") {
                  window.history.pushState({ strangerLens: true, view: "scan" }, "");
                }
                scanController.retryScan();
              }}
              onOpenFaq={() => {
                setOpenFaqIndex(null);
                setActiveInfoModal("faq");
              }}
              onOpenPricing={() => setActiveInfoModal("pricing")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAQ MODAL / BOTTOM SHEET */}
      <AnimatePresence>
        {activeInfoModal === "faq" && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Frequently Asked Questions"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveInfoModal(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
              className="bg-[#121824] rounded-t-3xl sm:rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-[#263044] relative max-h-[85vh] flex flex-col z-10 text-[#F1F5F9]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#263044] shrink-0">
                <div>
                  <h3 className="font-bold text-white text-xl tracking-tight">
                    Frequently Asked Questions
                  </h3>
                  <p className="text-xs sm:text-sm text-[#94A3B8] mt-0.5">
                    Everything you need to know about StrangerLens first-impression reviews.
                  </p>
                </div>
                <button
                  onClick={() => setActiveInfoModal(null)}
                  className="w-9 h-9 rounded-full hover:bg-[#171F2D] flex items-center justify-center text-[#94A3B8] hover:text-white transition cursor-pointer"
                  aria-label="Close FAQ"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 overflow-y-auto pr-1 divide-y divide-[#263044] flex-1">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaqIndex === idx;
                  const modalAnswerId = `faq-modal-answer-${idx}`;
                  return (
                    <div key={idx} className="py-3.5 first:pt-2 last:pb-2">
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full flex items-center justify-between gap-3 text-left py-1 group cursor-pointer bg-transparent border-0"
                        aria-expanded={isOpen}
                        aria-controls={modalAnswerId}
                      >
                        <span className="font-semibold text-white group-hover:text-[#3B82F6] transition-colors text-sm sm:text-base">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-[#64748B] shrink-0 transition-transform ${
                            isOpen ? "rotate-180 text-[#3B82F6]" : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            id={modalAnswerId}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <p className="pt-2 pb-1 text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                              {item.answer}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRICING MODAL / BOTTOM SHEET */}
      <AnimatePresence>
        {activeInfoModal === "pricing" && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pricing Plans"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveInfoModal(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
              className="bg-[#121824] rounded-t-3xl sm:rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-[#263044] relative max-h-[85vh] flex flex-col z-10 text-[#F1F5F9]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#263044] shrink-0">
                <div>
                  <h3 className="font-bold text-white text-xl tracking-tight">
                    Simple, Transparent Pricing
                  </h3>
                  <p className="text-xs sm:text-sm text-[#94A3B8] mt-0.5">
                    Start with a free first-impression preview today. One-time report unlocks with no subscriptions.
                  </p>
                </div>
                <button
                  onClick={() => setActiveInfoModal(null)}
                  className="w-9 h-9 rounded-full hover:bg-[#171F2D] flex items-center justify-center text-[#94A3B8] hover:text-white transition cursor-pointer"
                  aria-label="Close Pricing"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto overflow-y-auto flex-1 pr-1 pb-1 pt-2">
                {PRICING_PLANS.map((plan) => {
                  const isPaidPreLaunch = plan.isPaid && !IS_CHECKOUT_ENABLED;
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-2xl p-5 flex flex-col justify-between relative ${
                        plan.popular
                          ? "bg-[#171F2D] border-2 border-[#3B82F6] shadow-md shadow-blue-500/10"
                          : "bg-[#171F2D] border border-[#263044]"
                      }`}
                    >
                      {plan.badge && (
                        <div className="absolute -top-3 left-4 right-4 flex items-center justify-between gap-1.5 pointer-events-none">
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                              plan.popular
                                ? "bg-[#246BFD] text-white"
                                : "bg-emerald-600 text-white"
                            }`}
                          >
                            {plan.badge}
                          </span>
                        </div>
                      )}
                      <div>
                        <h4 className="font-extrabold text-white text-lg mb-0.5">
                          {plan.name}
                        </h4>
                        <p className="text-xs font-bold text-[#3B82F6] mb-1">
                          {plan.positioning}
                        </p>
                        <p className="text-xs text-[#94A3B8] mb-4 leading-relaxed">
                          {plan.description}
                        </p>
                        <div className="flex items-baseline gap-1.5 mb-4 pb-3 border-b border-[#263044] tabular-nums">
                          <span className="text-3xl font-extrabold text-white">
                            ${plan.price}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                            {plan.paymentLabel}
                          </span>
                        </div>
                        <div className="space-y-2 mb-6 text-xs text-[#F1F5F9]">
                          {plan.features.map((feat, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={scrollToInput}
                        className={`group w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                          plan.popular || !plan.isPaid
                            ? "bg-[#246BFD] hover:bg-blue-600 text-white shadow-md shadow-blue-500/20"
                            : "bg-[#121824] hover:bg-[#1C2638] text-white border border-[#263044]"
                        }`}
                      >
                        <span>
                          {isPaidPreLaunch ? plan.disabledCta : plan.cta} →
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-3.5 border-t border-[#263044] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#94A3B8] shrink-0">
                <span className="font-semibold text-white">
                  One-time payment · No subscription
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link href="/terms" className="hover:text-white underline underline-offset-2">
                    Terms
                  </Link>
                  <span aria-hidden="true">·</span>
                  <Link href="/privacy" className="hover:text-white underline underline-offset-2">
                    Privacy
                  </Link>
                  <span aria-hidden="true">·</span>
                  <Link href="/refund-policy" className="hover:text-white underline underline-offset-2">
                    Refund Policy
                  </Link>
                  <span aria-hidden="true">·</span>
                  <Link href="/contact" className="hover:text-white underline underline-offset-2">
                    Support
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
