import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield, FileText, RefreshCcw, Mail } from "lucide-react";
import { BRAND_NAME, LEGAL_CONFIG } from "@/lib/legal-config";

interface LegalLayoutProps {
  activePage: "privacy" | "terms" | "refund" | "contact";
  badge: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export default function LegalLayout({
  activePage,
  badge,
  title,
  subtitle,
  children,
}: LegalLayoutProps) {
  const navItems = [
    {
      id: "privacy" as const,
      label: "Privacy Policy",
      href: "/privacy",
      icon: Shield,
    },
    {
      id: "terms" as const,
      label: "Terms of Service",
      href: "/terms",
      icon: FileText,
    },
    {
      id: "refund" as const,
      label: "Refund Policy",
      href: "/refund-policy",
      icon: RefreshCcw,
    },
    {
      id: "contact" as const,
      label: "Contact Support",
      href: "/contact",
      icon: Mail,
    },
  ];

  return (
    <div className="min-h-screen bg-[#090D15] text-[#F1F5F9] font-sans selection:bg-[#246BFD] selection:text-white flex flex-col justify-between">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#090D15]/90 backdrop-blur-md border-b border-[#263044]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] rounded-lg"
            >
              <div className="w-8 h-8 rounded-xl bg-[#171F2D] border border-[#263044] text-white flex items-center justify-center font-bold text-sm shadow-xs group-hover:border-[#384660] group-hover:text-[#3B82F6] transition-colors">
                S
              </div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">
                {LEGAL_CONFIG.productName}
              </span>
            </Link>
            <span className="hidden sm:inline-block text-[#263044]">|</span>
            <span className="hidden sm:inline-block text-xs font-semibold text-[#94A3B8]">
              Trust &amp; Legal Center
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#F1F5F9] hover:text-white bg-[#171F2D] hover:bg-[#1C2638] border border-[#263044] hover:border-[#384660] px-3.5 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD]"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0 text-[#3B82F6]" />
              <span>Back to Analyzer</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Sub-navigation Pill Strip across the 4 Legal & Support Pages */}
        <nav
          aria-label="Legal and support pages"
          className="flex flex-wrap items-center gap-2 mb-8 pb-4 border-b border-[#263044]"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#246BFD] ${
                  isActive
                    ? "bg-[#246BFD] text-white shadow-md shadow-blue-500/20"
                    : "bg-[#171F2D] text-[#94A3B8] hover:text-white border border-[#263044] hover:border-[#384660]"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Page Hero Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <span className="inline-block text-[11px] font-bold tracking-widest text-[#3B82F6] uppercase bg-[#171F2D] px-3 py-1 rounded-full border border-[#263044]">
              {badge}
            </span>
            <span className="text-xs text-[#94A3B8] font-medium">
              Last Updated: {LEGAL_CONFIG.lastUpdated}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-2.5">
            {title}
          </h1>
          <p className="text-[15px] sm:text-base text-[#94A3B8] max-w-3xl leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Main Document Card */}
        <div className="bg-[#121824] border border-[#263044] rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10 shadow-2xl space-y-8 text-[15px] sm:text-base text-[#F1F5F9] leading-relaxed">
          {children}
        </div>

        {/* Bottom Support Callout Banner */}
        <div className="mt-8 bg-[#171F2D] border border-[#263044] rounded-2xl sm:rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-white">
              Have a question about billing, privacy, or your report?
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Reach our support team directly at{" "}
              <a
                href={`mailto:${LEGAL_CONFIG.supportEmail}`}
                className="font-semibold text-[#3B82F6] hover:underline"
              >
                {LEGAL_CONFIG.supportEmail}
              </a>{" "}
              · Response window: {LEGAL_CONFIG.supportResponseWindow}.
            </p>
          </div>
          {activePage !== "contact" && (
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#246BFD] hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold transition-all shrink-0 shadow-md shadow-blue-500/20"
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Contact Support</span>
            </Link>
          )}
        </div>
      </main>

      {/* Consistent Compliance Footer */}
      <footer className="border-t border-[#263044] bg-[#090D15] py-8 px-4 sm:px-6 mt-12">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#94A3B8]">
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

          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link
              href="/"
              className="hover:text-white transition-colors underline-offset-4 hover:underline"
            >
              Home
            </Link>
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
        </div>
      </footer>
    </div>
  );
}
