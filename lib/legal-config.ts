export const BRAND_NAME = "StrangerLens";

export const LEGAL_CONFIG = {
  brandName: BRAND_NAME,
  productName: BRAND_NAME,
  tagline: "AI Website First-Impression Clarity Analyzer",
  supportEmail: "hello.skyorigin@gmail.com",
  billingSupportNote:
    "For order receipts, payment inquiries, or report delivery questions, please email hello.skyorigin@gmail.com with your analyzed URL and order details.",
  supportResponseWindow: "Within 24–48 business hours (Monday–Friday)",
  effectiveDate: "October 14, 2026",
  lastUpdated: "October 14, 2026",
  pricing: {
    freeTier: {
      name: "Free Preview",
      price: "$0",
      billingType: "Free (No credit card or account required)",
      summary:
        "Instant clarity diagnosis. Includes overall website clarity score, five clarity signal scores (First Impression, Audience, Value, Trust, Action), and five signal statuses.",
    },
    singleReport: {
      name: "Full Clarity Report",
      price: "$5 USD",
      billingType: "One-time payment · No subscription",
      summary:
        "Complete action breakdown. Includes prioritized 1-2-3 fix plan, detailed analysis for all five signals (Why This Score?, What's Working?, What's Unclear?, How to Improve?), plus First 5 Seconds breakdown (What a Visitor May Understand and What a Visitor May Miss).",
    },
    threeReportPack: {
      name: "3-Report Pack",
      price: "$12 USD",
      billingType: "One-time payment · No subscription",
      summary: "3 complete Full Reports for comparing iterations or multiple websites.",
    },
  },
  refundPolicySummary:
    "Digital report purchases are generated on-demand and delivered digitally. StrangerLens does not offer an unconditional voluntary money-back guarantee, but statutory consumer protection rights under applicable law are fully respected. Commercial checkout is planned to be processed via Dodo Payments once live.",
  paymentProvider: {
    plannedProvider: "Dodo Payments",
    disclosure:
      "Commercial checkout is planned to be processed through Dodo Payments once live transactions are enabled. Live payment processing is not yet operational during the preview period.",
  },
  links: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Refund Policy", href: "/refund-policy" },
    { label: "Contact Support", href: "/contact" },
  ] as const,
};
