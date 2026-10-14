import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Clock, ShieldCheck, FileText, RefreshCcw, HelpCircle } from "lucide-react";
import LegalLayout from "@/components/LegalLayout";
import { BRAND_NAME, LEGAL_CONFIG } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: `Contact Support — ${BRAND_NAME}`,
  description:
    "Get customer support for StrangerLens website first-impression reports, billing, receipts, and refund inquiries.",
};

export default function ContactSupportPage() {
  return (
    <LegalLayout
      activePage="contact"
      badge="CUSTOMER SUPPORT"
      title="Contact Support"
      subtitle="Need help with a website scan, full report unlock, receipt, or refund? Our team is here to help."
    >
      {/* Primary Contact Card */}
      <section className="bg-[#171F2D] border border-[#263044] rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#3B82F6]">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span>DIRECT EMAIL SUPPORT</span>
          </span>
          <h2 className="text-lg sm:text-xl font-extrabold text-white">
            {LEGAL_CONFIG.supportEmail}
          </h2>
          <p className="text-xs sm:text-sm text-[#94A3B8] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
            <span>Typical response time: {LEGAL_CONFIG.supportResponseWindow}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <a
            href={`mailto:${LEGAL_CONFIG.supportEmail}?subject=StrangerLens%20Support%20Request`}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#246BFD] hover:bg-blue-600 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-blue-500/20"
          >
            <Mail className="w-4 h-4 shrink-0" />
            <span>Email Support Now</span>
          </a>
        </div>
      </section>

      {/* Support Categories */}
      <section className="space-y-4 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          How Can We Help You Today?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-5 space-y-2 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-[15px]">
                <FileText className="w-4 h-4 text-[#3B82F6] shrink-0" />
                <span>Report Access &amp; Website Scan Help</span>
              </div>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                Trouble scanning a specific URL or accessing your unlocked $5 Full Clarity Report? Let us know the website domain and the email address you used.
              </p>
            </div>
            <div className="pt-2">
              <a
                href={`mailto:${LEGAL_CONFIG.supportEmail}?subject=Report%20Access%20or%20Scan%20Help`}
                className="text-xs font-bold text-[#3B82F6] hover:underline inline-flex items-center gap-1"
              >
                <span>Request report assistance →</span>
              </a>
            </div>
          </div>

          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-5 space-y-2 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-[15px]">
                <RefreshCcw className="w-4 h-4 text-[#3B82F6] shrink-0" />
                <span>Refunds &amp; Billing Inquiries</span>
              </div>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                Need an invoice, receipt copy, or assistance under our{" "}
                <Link href="/refund-policy" className="text-[#3B82F6] font-semibold hover:underline">
                  Refund Policy
                </Link>
                ? Include your checkout email or order reference.
              </p>
            </div>
            <div className="pt-2">
              <a
                href={`mailto:${LEGAL_CONFIG.supportEmail}?subject=Billing%20or%20Refund%20Request`}
                className="text-xs font-bold text-[#3B82F6] hover:underline inline-flex items-center gap-1"
              >
                <span>Email billing support →</span>
              </a>
            </div>
          </div>

          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-5 space-y-2 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-[15px]">
                <ShieldCheck className="w-4 h-4 text-[#3B82F6] shrink-0" />
                <span>Privacy &amp; Data Requests</span>
              </div>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                Questions about our{" "}
                <Link href="/privacy" className="text-[#3B82F6] font-semibold hover:underline">
                  Privacy Policy
                </Link>{" "}
                or exercising your data access/deletion rights? Contact our team anytime.
              </p>
            </div>
            <div className="pt-2">
              <a
                href={`mailto:${LEGAL_CONFIG.supportEmail}?subject=Privacy%20Inquiry`}
                className="text-xs font-bold text-[#3B82F6] hover:underline inline-flex items-center gap-1"
              >
                <span>Submit privacy inquiry →</span>
              </a>
            </div>
          </div>

          <div className="bg-[#171F2D] border border-[#263044] rounded-2xl p-5 space-y-2 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-[15px]">
                <HelpCircle className="w-4 h-4 text-[#3B82F6] shrink-0" />
                <span>Product &amp; General Questions</span>
              </div>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                Have feedback on {LEGAL_CONFIG.productName}, questions about your Full Clarity Report ($5), or general product inquiries? We read every message.
              </p>
            </div>
            <div className="pt-2">
              <a
                href={`mailto:${LEGAL_CONFIG.supportEmail}?subject=StrangerLens%20General%20Question`}
                className="text-xs font-bold text-[#3B82F6] hover:underline inline-flex items-center gap-1"
              >
                <span>Send a message →</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* What to Include for Fastest Resolution */}
      <section className="space-y-3 pt-6 border-t border-[#263044]">
        <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          What to Include in Your Support Email
        </h2>
        <p className="text-xs sm:text-sm text-[#94A3B8]">
          To help us resolve your request in a single reply, please include:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[#94A3B8]">
          <li>
            <strong>Website URL:</strong> The domain or URL you analyzed (e.g., <code className="bg-[#090D15] text-[#3B82F6] px-1.5 py-0.5 rounded border border-[#263044]">example.com</code>).
          </li>
          <li>
            <strong>Checkout Email Address:</strong> The email address entered when unlocking a paid report.
          </li>
          <li>
            <strong>Order Reference (if applicable):</strong> Your transaction or order reference for billing inquiries.
          </li>
        </ul>
      </section>

      {/* Payment Provider & Service Disclosure */}
      <section className="space-y-2 pt-6 border-t border-[#263044] text-xs sm:text-sm text-[#94A3B8]">
        <h2 className="text-base font-extrabold text-white tracking-tight">
          Service &amp; Billing Information
        </h2>
        <p>
          <strong>Service:</strong> {BRAND_NAME} ({LEGAL_CONFIG.tagline}).
        </p>
        <p className="leading-relaxed">{LEGAL_CONFIG.paymentProvider.disclosure}</p>
      </section>
    </LegalLayout>
  );
}
