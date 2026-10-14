import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import LegalLayout from "@/components/LegalLayout";
import { BRAND_NAME, LEGAL_CONFIG } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: `Terms of Service — ${BRAND_NAME}`,
  description:
    "Terms of Service governing the use of StrangerLens AI website first-impression reviews and one-time report purchases.",
};

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      activePage="terms"
      badge="TERMS OF SERVICE"
      title="Terms of Service"
      subtitle="Clear terms governing your use of StrangerLens free clarity previews and one-time $5 Full Clarity Reports."
    >
      {/* 1. Agreement to Terms */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          1. Agreement to Terms
        </h2>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of{" "}
          <strong>{BRAND_NAME}</strong> (&ldquo;StrangerLens&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). By accessing {BRAND_NAME}, running a website scan, or purchasing a Full Clarity Report, you agree to be bound by these Terms.
        </p>
      </section>

      {/* 2. Description of Service */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          2. Description of the Service
        </h2>
        <p>
          {LEGAL_CONFIG.productName} is an AI-powered website first-impression clarity analyzer. When you submit a public website URL, our system inspects publicly accessible website content, extracts visible text, and evaluates five core clarity signals: <strong>First Impression</strong>, <strong>Audience</strong>, <strong>Value</strong>, <strong>Trust</strong>, and <strong>Action</strong>.
        </p>
        <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-4 sm:p-5 text-xs sm:text-sm text-[#94A3B8] space-y-1.5">
          <p className="font-bold text-white text-sm">Scope of Analysis Notice:</p>
          <p className="leading-relaxed">
            {LEGAL_CONFIG.productName} evaluates website communication clarity based on the content actually inspected from your public URL. It is <strong>not</strong> a cybersecurity scanner, technical SEO crawler, PageSpeed performance benchmark, accessibility compliance certification, or real human visitor panel.
          </p>
        </div>
      </section>

      {/* 3. Pricing, One-Time Purchases & Payment Provider */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          3. Pricing, One-Time Purchases &amp; Payment Processing
        </h2>
        <p>
          {LEGAL_CONFIG.productName} offers a free clarity preview and an optional one-time paid Full Clarity Report with <strong>no recurring subscriptions</strong>:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-4 sm:p-5 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              {LEGAL_CONFIG.pricing.freeTier.name}
            </span>
            <p className="text-xl font-extrabold text-white">
              {LEGAL_CONFIG.pricing.freeTier.price}{" "}
              <span className="text-xs font-medium text-[#94A3B8]">· Free</span>
            </p>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">{LEGAL_CONFIG.pricing.freeTier.summary}</p>
          </div>

          <div className="bg-[#171F2D] border-2 border-[#3B82F6] rounded-2xl p-4 sm:p-5 space-y-2 shadow-[0_0_30px_rgba(59,130,246,0.12)]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#3B82F6]">
              {LEGAL_CONFIG.pricing.singleReport.name}
            </span>
            <p className="text-xl font-extrabold text-white">
              {LEGAL_CONFIG.pricing.singleReport.price}{" "}
              <span className="text-xs font-medium text-[#94A3B8]">· One-time payment</span>
            </p>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">{LEGAL_CONFIG.pricing.singleReport.summary}</p>
          </div>
        </div>
        <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-4 sm:p-5 text-xs sm:text-sm text-[#94A3B8] mt-3">
          <p className="font-bold text-white mb-1">
            Payment Provider Disclosure ({LEGAL_CONFIG.paymentProvider.plannedProvider}):
          </p>
          <p className="leading-relaxed">{LEGAL_CONFIG.paymentProvider.disclosure}</p>
        </div>
      </section>

      {/* 4. Acceptable Use */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          4. Acceptable Use &amp; Rate Limits
        </h2>
        <p>When using {LEGAL_CONFIG.productName}, you agree not to:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#94A3B8]">
          <li>Submit private, internal-network, or restricted URLs that you do not have permission to access.</li>
          <li>Attempt to bypass API rate limits, automated request protections, or security controls.</li>
          <li>Use automated bots or scripts to bulk-harvest analyses or overload our infrastructure.</li>
          <li>Misrepresent AI-generated communication evaluations as certified legal, financial, or security audits.</li>
        </ul>
      </section>

      {/* 5. Intellectual Property & Report Usage */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          5. Intellectual Property &amp; License to Use Reports
        </h2>
        <p>
          You retain all rights to the websites and content you submit for review. Upon generating a free preview or purchasing a full report, we grant you a worldwide, royalty-free, non-exclusive license to use, download, share internally or with clients, and implement any diagnostic clarity recommendations generated in your {LEGAL_CONFIG.productName} report.
        </p>
      </section>

      {/* 6. Refunds & Cancellations */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          6. Refunds &amp; Digital Product Policy
        </h2>
        <p>
          Because {LEGAL_CONFIG.productName} only offers one-time digital purchases (never recurring subscriptions), there is no recurring billing to cancel after purchase. Digital report purchases are generated on-demand and delivered digitally. StrangerLens does not offer an unconditional voluntary money-back guarantee, but statutory consumer protection rights under applicable law are fully respected, as detailed in our{" "}
          <Link href="/refund-policy" className="font-semibold text-[#3B82F6] hover:underline">
            Refund Policy
          </Link>
          .
        </p>
      </section>

      {/* 7. Disclaimer of Warranties & Limitation of Liability */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          7. Disclaimers &amp; Limitation of Liability
        </h2>
        <p>
          {LEGAL_CONFIG.productName} is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. While our pipeline validates extracted page content and applies consistent evaluation criteria, AI-generated evaluations and observations are advisory only. We do not guarantee specific commercial outcomes, conversion rate increases, or uninterrupted availability of third-party websites being scanned.
        </p>
        <p className="text-[#94A3B8]">
          To the maximum extent permitted by applicable law, {BRAND_NAME}&apos;s total cumulative liability arising out of or relating to your use of {BRAND_NAME} shall not exceed the greater of (a) the total amount paid by you for {BRAND_NAME} reports in the twelve (12) months preceding the claim, or (b) $25 USD.
        </p>
      </section>

      {/* 8. Contact Information */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          8. Contact Us
        </h2>
        <p>
          Questions about these Terms can be sent to{" "}
          <a
            href={`mailto:${LEGAL_CONFIG.supportEmail}`}
            className="font-semibold text-[#3B82F6] hover:underline"
          >
            {LEGAL_CONFIG.supportEmail}
          </a>{" "}
          or via our{" "}
          <Link href="/contact" className="font-semibold text-[#3B82F6] hover:underline">
            Contact Support
          </Link>{" "}
          page.
        </p>
      </section>
    </LegalLayout>
  );
}
