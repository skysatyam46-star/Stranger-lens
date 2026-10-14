import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import LegalLayout from "@/components/LegalLayout";
import { BRAND_NAME, LEGAL_CONFIG } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: `Refund Policy — ${BRAND_NAME}`,
  description:
    "Refund Policy for StrangerLens one-time digital report purchases ($5 Full Clarity Report), statutory consumer rights, and billing support.",
};

export default function RefundPolicyPage() {
  return (
    <LegalLayout
      activePage="refund"
      badge="REFUND POLICY"
      title="Refund Policy"
      subtitle="Clear refund terms for StrangerLens one-time digital report purchases, technical delivery issues, statutory consumer rights, and billing support."
    >
      {/* Summary Callout */}
      <section className="bg-[#171F2D] border border-[#263044] rounded-2xl p-5 space-y-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#3B82F6] block">
          ONE-TIME DIGITAL PURCHASES · NO SUBSCRIPTIONS
        </span>
        <h2 className="text-base sm:text-lg font-extrabold text-white">
          Policy Summary
        </h2>
        <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
          Digital report purchases are generated on-demand and delivered digitally. {LEGAL_CONFIG.productName} does not offer an unconditional voluntary money-back guarantee, but statutory consumer protection rights under applicable law are fully respected. Commercial checkout is planned to be processed via Dodo Payments once live.
        </p>
      </section>

      {/* 1. Digital Product Purchases */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          1. Digital Product Purchases
        </h2>
        <p>
          The paid offering on <strong>{LEGAL_CONFIG.productName}</strong> — the{" "}
          <strong>$5 Full Clarity Report</strong> — is a one-time digital product purchase with no recurring subscriptions or automatic renewals.
        </p>
        <p className="text-[#94A3B8]">
          Before purchasing a paid report, you can run a <strong>Free Preview ($0)</strong> to see your overall website clarity score, five clarity signal scores (First Impression, Audience, Value, Trust, Action), and five signal statuses at no cost.
        </p>
      </section>

      {/* 2. General Refund Approach */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          2. General Refund Approach
        </h2>
        <p>
          Because {LEGAL_CONFIG.productName} reports are on-demand digital diagnostic products delivered digitally upon unlock, digital report purchases are generally final once delivered. {LEGAL_CONFIG.productName} does not offer a separate voluntary money-back guarantee or satisfaction-based trial period.
        </p>
        <p className="text-[#94A3B8]">
          All refund inquiries are evaluated in accordance with applicable consumer protection laws and the procedures of our payment provider.
        </p>
      </section>

      {/* 3. Failed Delivery or Technical Issues */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          3. Failed Delivery or Technical Issues
        </h2>
        <p>
          If you experience a technical delivery problem — such as a paid report failing to unlock after payment confirmation or a report failing to generate due to a technical system error — please contact our support team at{" "}
          <a
            href={`mailto:${LEGAL_CONFIG.supportEmail}?subject=StrangerLens%20Technical%20Delivery%20Issue`}
            className="font-semibold text-[#3B82F6] hover:underline"
          >
            {LEGAL_CONFIG.supportEmail}
          </a>
          .
        </p>
        <p className="text-[#94A3B8]">
          Please include the email address used at checkout, the website URL analyzed, and your order transaction reference so we can investigate the delivery issue and assist with a prompt resolution.
        </p>
      </section>

      {/* 4. Duplicate or Incorrect Charges */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          4. Duplicate or Incorrect Charges
        </h2>
        <p>
          If you believe you were charged more than once for the same order or experienced an accidental duplicate transaction, please contact us at{" "}
          <a
            href={`mailto:${LEGAL_CONFIG.supportEmail}?subject=Duplicate%20Charge%20Inquiry`}
            className="font-semibold text-[#3B82F6] hover:underline"
          >
            {LEGAL_CONFIG.supportEmail}
          </a>{" "}
          with your transaction details so the duplicate charge can be promptly reviewed and corrected.
        </p>
      </section>

      {/* 5. Statutory Consumer Rights */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          5. Statutory Consumer Rights
        </h2>
        <p>
          Nothing in this Refund Policy waives, limits, or excludes any mandatory statutory consumer protection or cancellation rights that apply to you under the laws of your jurisdiction (including applicable EU, EEA, UK, or local consumer protection regulations).
        </p>
      </section>

      {/* 6. Payment Provider & Billing Support */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          6. Payment Provider &amp; Billing Support
        </h2>
        <p>
          {LEGAL_CONFIG.paymentProvider.disclosure}
        </p>
        <p className="text-[#94A3B8]">
          When live checkout is enabled, payments and eligible billing adjustments will be processed in coordination with our payment partner, <strong>{LEGAL_CONFIG.paymentProvider.plannedProvider}</strong>. For any billing, receipt, or payment support inquiries, reach out directly to our support team at{" "}
          <a
            href={`mailto:${LEGAL_CONFIG.supportEmail}`}
            className="font-semibold text-[#3B82F6] hover:underline"
          >
            {LEGAL_CONFIG.supportEmail}
          </a>
          .
        </p>
      </section>

      {/* 7. Customer Support */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          7. Customer Support
        </h2>
        <p>
          If you need help with a report delivery issue, billing receipt, or order question, please visit our{" "}
          <Link href="/contact" className="font-semibold text-[#3B82F6] hover:underline">
            Contact Support
          </Link>{" "}
          page or email us directly at{" "}
          <a
            href={`mailto:${LEGAL_CONFIG.supportEmail}`}
            className="font-semibold text-[#3B82F6] hover:underline"
          >
            {LEGAL_CONFIG.supportEmail}
          </a>
          . We respond within {LEGAL_CONFIG.supportResponseWindow}.
        </p>
      </section>
    </LegalLayout>
  );
}
