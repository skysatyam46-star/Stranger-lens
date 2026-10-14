import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import LegalLayout from "@/components/LegalLayout";
import { BRAND_NAME, LEGAL_CONFIG } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: `Privacy Policy — ${BRAND_NAME}`,
  description:
    "Learn how StrangerLens collects, processes, and protects information when you analyze a website or purchase a full report.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      activePage="privacy"
      badge="PRIVACY POLICY"
      title="Privacy Policy"
      subtitle="How StrangerLens handles website URLs, inspected publicly accessible website content, local browser storage, and checkout information."
    >
      {/* 1. Overview & Scope */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          1. Overview &amp; Scope
        </h2>
        <p>
          This Privacy Policy explains how <strong>{BRAND_NAME}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, and safeguards information when you use our website first-impression clarity analyzer, preview free clarity results, or unlock a paid $5 Full Clarity Report.
        </p>
        <p className="text-[#94A3B8]">
          We design {BRAND_NAME} around data minimization: you can run a free website first-impression review without creating an account, and we only process the data necessary to deliver your website clarity analysis and fulfill report purchases.
        </p>
      </section>

      {/* 2. Information We Collect */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          2. Information We Collect and Process
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-4 sm:p-5 space-y-2">
            <h3 className="font-bold text-white text-sm sm:text-[15px]">
              A. Website URLs &amp; Public Page Content
            </h3>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              When you submit a URL for analysis, our servers verify reachability and inspect the publicly accessible HTML and visible text of that website to evaluate visitor clarity across five core communication signals.
            </p>
          </div>

          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-4 sm:p-5 space-y-2">
            <h3 className="font-bold text-white text-sm sm:text-[15px]">
              B. Email Address (Report Delivery &amp; Support)
            </h3>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              When you unlock a paid $5 Full Clarity Report or reach out to support, we collect your email address to deliver report access, order confirmations, receipts, and customer support responses.
            </p>
          </div>

          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-4 sm:p-5 space-y-2">
            <h3 className="font-bold text-white text-sm sm:text-[15px]">
              C. Payment &amp; Billing Information
            </h3>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              Commercial checkout is planned to be processed via our payment partner, <strong>{LEGAL_CONFIG.paymentProvider.plannedProvider}</strong>, once live transactions are enabled. Live payment processing is not operational during the current preview period. When live checkout launches, we do not collect, process, or store raw credit card numbers or payment credentials on StrangerLens servers.
            </p>
          </div>

          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-4 sm:p-5 space-y-2">
            <h3 className="font-bold text-white text-sm sm:text-[15px]">
              D. Technical Request &amp; Rate-Limit Metadata
            </h3>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              To protect service reliability and prevent automated abuse, our API processes transient request metadata (such as IP address and request timestamps) for short-term rate limiting and security protection.
            </p>
          </div>
        </div>
      </section>

      {/* 3. How AI Analysis Processes Website Content */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          3. How AI Analysis Works
        </h2>
        <p>
          When you request a website review, {LEGAL_CONFIG.productName} extracts publicly visible text elements (such as page titles, meta descriptions, headings, body copy, navigation labels, and calls to action) from the submitted public URL. This extracted text is processed solely to generate structured clarity scores across five signals (First Impression, Audience, Value, Trust, Action) and deliver actionable improvement insights.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#94A3B8]">
          <li>We evaluate website communication based only on the content actually inspected from publicly reachable pages; we do not bypass authentication, paywalls, or private intranet pages.</li>
          <li>StrangerLens is an AI-powered clarity analyzer and does not conduct real human visitor testing, accessibility compliance audits, or technical performance tests.</li>
        </ul>
      </section>

      {/* 4. Local Browser Storage */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          4. Local Browser Storage &amp; Cookies
        </h2>
        <p>
          {LEGAL_CONFIG.productName} uses your browser&apos;s local storage (<code>localStorage</code>) on your own device to store your active report session and clarity analysis locally. This ensures your completed report is preserved when navigating or refreshing, without triggering automatic rescans.
        </p>
        <p className="text-xs sm:text-sm text-[#94A3B8]">
          You can clear this cached report session at any time by clearing your browser&apos;s site data for {LEGAL_CONFIG.productName}. We do not use third-party tracking or advertising cookies.
        </p>
      </section>

      {/* 5. Third-Party Service Providers */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          5. Third-Party Service Providers &amp; Subprocessors
        </h2>
        <p>
          We do not sell or rent your personal information to third parties. We share limited data only with essential infrastructure partners required to operate the service:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#94A3B8]">
          <li>
            <strong>Planned Payment Provider ({LEGAL_CONFIG.paymentProvider.plannedProvider}):</strong> Planned to process checkout payments, invoicing, and payment receipts once live transactions are launched.
          </li>
          <li>
            <strong>AI Inference Providers:</strong> Processes extracted public website text to return structured first-impression evaluations.
          </li>
          <li>
            <strong>Cloud Hosting Infrastructure:</strong> Hosts our Next.js web application and API endpoints.
          </li>
        </ul>
      </section>

      {/* 6. Data Retention & Your Rights */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          6. Data Retention &amp; Your Privacy Rights
        </h2>
        <p>
          Rate-limiting logs are kept transiently in memory to prevent abuse. Order records associated with paid report purchases will be retained as required by applicable tax and accounting laws once checkout is operational. Depending on your jurisdiction (including GDPR, UK GDPR, and CCPA), you have the right to request access to, correction of, or deletion of personal data associated with your email address.
        </p>
        <p>
          To exercise any privacy right or ask a question about data handling, email us at{" "}
          <a
            href={`mailto:${LEGAL_CONFIG.supportEmail}`}
            className="font-semibold text-[#3B82F6] hover:underline"
          >
            {LEGAL_CONFIG.supportEmail}
          </a>{" "}
          or visit our{" "}
          <Link href="/contact" className="font-semibold text-[#3B82F6] hover:underline">
            Contact Support
          </Link>{" "}
          page.
        </p>
      </section>
    </LegalLayout>
  );
}
