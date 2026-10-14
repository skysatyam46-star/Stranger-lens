import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test, expect } from "./test-harness";
import { extractWebsiteSnapshot } from "../lib/content-extractor";
import { validateAndScoreAnalysis } from "../services/validation/analysisValidator";
import { mapBackendToFrontend } from "../lib/mapper";
import ResultsScreen from "../components/ResultsScreen";
import { WebsiteAnalysis } from "../services/ai/analysisSchema";
import { SupportingContext } from "../types/supportingContext";
import { isSupportingPagesEnabled } from "../server/config/limits";

const HOMEPAGE_URL = "https://acmeworkflow.com";

const HOMEPAGE_HTML = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>AcmeWorkflow — Automate Revenue Operations</title>
    <meta name="description" content="AcmeWorkflow helps B2B revenue teams automate CRM hygiene and deal routing." />
  </head>
  <body>
    <header>
      <span class="logo">AcmeWorkflow</span>
      <nav>
        <a href="/features">Features</a>
        <a href="/pricing">Pricing</a>
        <a href="/customers">Customers</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <h1>Automate revenue operations for B2B sales teams</h1>
        <p class="lead">Eliminate manual CRM entry and route leads in seconds.</p>
        <a href="/pricing" class="btn-primary">See Pricing Plans</a>
      </section>
    </main>
  </body>
</html>
`;

function createMockHomepageAiAnalysis(): WebsiteAnalysis {
  return {
    analysis_version: "1.0",
    verdict: {
      status: "clear",
      text: "AcmeWorkflow clearly communicates its B2B revenue operations focus and core benefit.",
    },
    first_seconds: {
      what_is_this: {
        status: "clear",
        explanation: "States revenue operations automation.",
        evidence_refs: [
          {
            source: "hero",
            element: "h1",
            text: "Automate revenue operations for B2B sales teams",
          },
        ],
      },
      who_is_it_for: {
        status: "clear",
        explanation: "Explicitly targets B2B sales teams.",
        evidence_refs: [
          {
            source: "hero",
            element: "h1",
            text: "Automate revenue operations for B2B sales teams",
          },
        ],
      },
      what_will_i_get: {
        status: "clear",
        explanation: "Eliminates manual CRM entry and routes leads.",
        evidence_refs: [
          {
            source: "hero",
            element: "p",
            text: "Eliminate manual CRM entry and route leads in seconds.",
          },
        ],
      },
      why_should_i_care: {
        status: "partly_clear",
        explanation: "Homepage hero does not show proof above the fold.",
        evidence_refs: [],
      },
      what_should_i_do_next: {
        status: "clear",
        explanation: "Clear primary CTA to view pricing plans.",
        evidence_refs: [
          {
            source: "cta",
            element: "a",
            text: "See Pricing Plans",
          },
        ],
      },
    },
    visitor_thought: {
      text: "This is a RevOps automation tool for B2B sales teams that routes leads and updates our CRM.",
      confidence: "high",
    },
    signals: {
      first_impression: {
        score: 86,
        status: "clear",
        explanation: "Clear category and audience in headline.",
        confidence: "high",
        evidence_refs: [
          {
            source: "hero",
            text: "Automate revenue operations for B2B sales teams",
          },
        ],
      },
      audience: {
        score: 84,
        status: "clear",
        explanation: "Explicitly names B2B sales teams.",
        confidence: "high",
        evidence_refs: [
          {
            source: "hero",
            text: "Automate revenue operations for B2B sales teams",
          },
        ],
      },
      value: {
        score: 82,
        status: "clear",
        explanation: "Concrete benefit of eliminating manual CRM entry.",
        confidence: "high",
        evidence_refs: [
          {
            source: "hero",
            text: "Eliminate manual CRM entry and route leads in seconds.",
          },
        ],
      },
      trust: {
        score: 52,
        status: "partly_clear",
        explanation: "Limited proof on the homepage itself.",
        confidence: "medium",
        evidence_refs: [],
      },
      action: {
        score: 80,
        status: "clear",
        explanation: "Direct primary CTA.",
        confidence: "high",
        evidence_refs: [
          {
            source: "cta",
            text: "See Pricing Plans",
          },
        ],
      },
    },
    risks: [
      {
        category: "trust",
        severity: "medium",
        title: "Homepage lacks visible customer proof",
        description: "First-time visitors do not see testimonials on the homepage.",
        why_it_matters: "B2B buyers look for peer validation.",
        evidence_refs: [],
      },
    ],
    priority_fix: {
      title: "Surface a customer proof point on the homepage",
      reason: "Strengthens immediate credibility.",
      impact: "high",
      what_you_say_now: "Automate revenue operations for B2B sales teams",
      clearer_direction:
        "Automate revenue operations for B2B sales teams — used by modern RevOps teams",
      current_direction: "Automate revenue operations for B2B sales teams",
      suggested_direction:
        "Automate revenue operations for B2B sales teams — used by modern RevOps teams",
      evidence_refs: [
        {
          source: "hero",
          text: "Automate revenue operations for B2B sales teams",
        },
      ],
    },
    other_improvements: [],
  };
}

function createFullSupportingContext(): SupportingContext {
  return {
    status: "available",
    pagesAnalyzed: [
      {
        url: "https://acmeworkflow.com/pricing",
        category: "pricing",
        title: "Pricing — AcmeWorkflow",
      },
      {
        url: "https://acmeworkflow.com/features",
        category: "features",
        title: "Features — AcmeWorkflow",
      },
      {
        url: "https://acmeworkflow.com/customers",
        category: "customers",
        title: "Customer Stories — AcmeWorkflow",
      },
    ],
    messageConsistency: {
      status: "clarifies_homepage",
      assessment:
        "The features and pricing pages reinforce the homepage's B2B revenue operations promise with concrete CRM sync and lead-routing details.",
      evidence: [
        {
          sourceUrl: "https://acmeworkflow.com/features",
          excerpt: "Real-time bi-directional CRM synchronization",
          interpretation: "Expands on the homepage's CRM hygiene promise.",
          claimBasis: "directly_observed_element",
        },
      ],
    },
    trustContext: {
      status: "observed",
      assessment:
        "The customers page publishes a customer count heading and named quote (website-published claims, not independently verified).",
      evidence: [
        {
          sourceUrl: "https://acmeworkflow.com/customers",
          excerpt: "Trusted by 450+ B2B revenue operations teams",
          interpretation: "Published customer adoption heading.",
          claimBasis: "website_published_claim",
        },
      ],
    },
    ctaDestination: {
      ctaText: "See Pricing Plans",
      destinationUrl: "https://acmeworkflow.com/pricing",
      inspectable: true,
      purposeClear: true,
      alignsWithCtaWording: true,
      nextActionUnderstandable: true,
      assessment:
        "The primary CTA ('See Pricing Plans') leads directly to /pricing, which displays transparent plan tiers and a 14-day trial action.",
      evidence: [
        {
          sourceUrl: "https://acmeworkflow.com/pricing",
          excerpt: "Transparent pricing for growing revenue teams",
          claimBasis: "directly_observed_element",
        },
      ],
    },
    limitations: [],
  };
}

function renderResultsMarkup(supportingContext?: SupportingContext) {
  const snapshot = extractWebsiteSnapshot(HOMEPAGE_HTML, {
    baseUrl: HOMEPAGE_URL,
  });
  const validated = validateAndScoreAnalysis(
    createMockHomepageAiAnalysis(),
    snapshot
  );
  const mapped = mapBackendToFrontend(
    validated,
    HOMEPAGE_URL,
    snapshot,
    supportingContext
  );
  const html = renderToStaticMarkup(
    React.createElement(ResultsScreen, {
      rawUrl: HOMEPAGE_URL,
      analysisData: mapped,
      onBackToLanding: () => {},
      onRunNewCheck: () => {},
      onOpenFaq: () => {},
      onOpenPricing: () => {},
    })
  );
  return { html, mapped, validated };
}

describe("Multi-Page Expansion — Phase 3 Results Integration & Final Verification", () => {
  test("1. Feature flag remains disabled (false) by default and homepage-only ResultsScreen omits Supporting Pages Insights", () => {
    const prevEnv = process.env.ENABLE_SUPPORTING_PAGES_ANALYSIS;
    delete process.env.ENABLE_SUPPORTING_PAGES_ANALYSIS;
    try {
      expect(isSupportingPagesEnabled()).toBe(false);

      const { html, mapped } = renderResultsMarkup(undefined);
      expect(mapped.supportingContext).toBe(undefined);
      expect(html.includes('id="supporting-pages-insights-section"')).toBe(false);
      expect(html.includes("Supporting Pages Insights")).toBe(false);
      // Core homepage sections remain intact
      expect(html.includes('id="complete-homepage-evidence-section"')).toBe(true);
      expect(html.includes('id="five-detailed-signals-section"')).toBe(true);
      expect(html.includes('id="recheck-compare-section"')).toBe(true);
    } finally {
      if (prevEnv !== undefined) {
        process.env.ENABLE_SUPPORTING_PAGES_ANALYSIS = prevEnv;
      }
    }
  });

  test("2. Renders Supporting Pages Insights in Level 3 strictly after Complete Homepage Evidence and before Five Detailed Signals", () => {
    const { html, mapped, validated } = renderResultsMarkup(
      createFullSupportingContext()
    );

    // Homepage score & signals are completely unchanged
    expect(mapped.score).toBe(validated.overall_score);
    expect(mapped.score).toBe(79);

    // Section is rendered
    expect(html.includes('id="supporting-pages-insights-section"')).toBe(true);
    expect(html.includes("Supporting Pages Insights")).toBe(true);
    expect(
      html.includes(
        "Additional context from relevant pages linked to your homepage."
      )
    ).toBe(true);
    expect(
      html.includes(
        "Supporting-page findings provide additional context and do not affect your homepage first-impression score."
      )
    ).toBe(true);

    // Verify exact DOM order: Section 12 -> Supporting Pages Insights -> Section 13 -> Section 14 -> Section 15
    const idxSection12 = html.indexOf('id="complete-homepage-evidence-section"');
    const idxSupporting = html.indexOf('id="supporting-pages-insights-section"');
    const idxSection13 = html.indexOf('id="five-detailed-signals-section"');
    const idxSection14 = html.indexOf('id="communication-risks-section"');
    const idxSection15 = html.indexOf('id="recheck-compare-section"');

    expect(idxSection12).toBeGreaterThan(0);
    expect(idxSupporting).toBeGreaterThan(idxSection12);
    expect(idxSection13).toBeGreaterThan(idxSupporting);
    expect(idxSection14).toBeGreaterThan(idxSection13);
    expect(idxSection15).toBeGreaterThan(idxSection14);
  });

  test("3. Renders Pages Reviewed, Message Consistency, Additional Trust Context (with published-claim qualification), and Next-Step Context", () => {
    const { html } = renderResultsMarkup(createFullSupportingContext());

    // A. PAGES REVIEWED (3 pages)
    expect(html.includes("3 pages reviewed")).toBe(true);
    expect(html.includes("PAGES REVIEWED")).toBe(true);
    expect(html.includes("acmeworkflow.com/pricing")).toBe(true);
    expect(html.includes("acmeworkflow.com/features")).toBe(true);
    expect(html.includes("acmeworkflow.com/customers")).toBe(true);

    // B. MESSAGE CONSISTENCY
    expect(html.includes("MESSAGE CONSISTENCY")).toBe(true);
    expect(html.includes("Clarifies homepage promise")).toBe(true);
    expect(
      html.includes("Real-time bi-directional CRM synchronization")
    ).toBe(true);
    expect(html.includes("Source (Features):")).toBe(true);

    // C. ADDITIONAL TRUST CONTEXT (must qualify website-published claims)
    expect(html.includes("ADDITIONAL TRUST CONTEXT")).toBe(true);
    expect(html.includes("Website-published claim")).toBe(true);
    expect(
      html.includes("Trusted by 450+ B2B revenue operations teams")
    ).toBe(true);
    expect(
      html.includes(
        "Testimonials, metrics, and credentials on supporting pages are website-published claims and are not independently verified by StrangerLens."
      )
    ).toBe(true);

    // D. NEXT-STEP CONTEXT
    expect(html.includes("NEXT-STEP CONTEXT")).toBe(true);
    expect(html.includes("Destination inspected")).toBe(true);
    expect(html.includes("See Pricing Plans")).toBe(true);
    expect(html.includes("Purpose: Clear")).toBe(true);
    expect(html.includes("CTA alignment: Aligned")).toBe(true);
    expect(html.includes("Next action: Understandable")).toBe(true);
    expect(
      html.includes("Transparent pricing for growing revenue teams")
    ).toBe(true);
  });

  test("4. Partial supporting context with non-followed CTA and fetch limitation renders honest status and ANALYSIS LIMITATIONS", () => {
    const partialCtx: SupportingContext = {
      status: "partial",
      pagesAnalyzed: [
        {
          url: "https://acmeworkflow.com/features",
          category: "features",
        },
      ],
      messageConsistency: {
        status: "consistent",
        assessment:
          "The features page aligns with the homepage B2B revenue operations promise.",
        evidence: [
          {
            sourceUrl: "https://acmeworkflow.com/features",
            excerpt: "Real-time bi-directional CRM synchronization",
          },
        ],
      },
      ctaDestination: {
        ctaText: "Start Free Trial",
        destinationUrl: "https://acmeworkflow.com/signup",
        inspectable: false,
        assessment:
          "The homepage primary CTA ('Start Free Trial') points to an account, signup, checkout, or non-supporting flow (/signup), which is intentionally not executed or crawled.",
        evidence: [],
      },
      limitations: [
        "Supporting page https://acmeworkflow.com/customers (customers) could not be analyzed: Website fetch timed out after 5 seconds.",
        "Primary CTA ('Start Free Trial' -> /signup) points to a signup, authentication, checkout, or utility flow that is intentionally not followed.",
      ],
    };

    const { html } = renderResultsMarkup(partialCtx);

    expect(html.includes("1 page reviewed")).toBe(true);
    expect(html.includes("Destination not followed")).toBe(true);
    expect(html.includes("ANALYSIS LIMITATIONS")).toBe(true);
    expect(
      html.includes("Website fetch timed out after 5 seconds")
    ).toBe(true);
  });

  test("5. Suppresses Supporting Pages Insights completely when status is unavailable or no grounded evidence exists", () => {
    const unavailableCtx: SupportingContext = {
      status: "unavailable",
      pagesAnalyzed: [],
      limitations: [
        "No eligible same-domain supporting pages were discovered on the homepage.",
      ],
    };

    const { html: htmlUnavailable } = renderResultsMarkup(unavailableCtx);
    expect(
      htmlUnavailable.includes('id="supporting-pages-insights-section"')
    ).toBe(false);

    // Also test when pagesAnalyzed has an entry, but all sub-insights lack verified evidence
    const emptyInsightsCtx: SupportingContext = {
      status: "available",
      pagesAnalyzed: [
        {
          url: "https://acmeworkflow.com/pricing",
          category: "pricing",
        },
      ],
      messageConsistency: {
        status: "consistent",
        assessment: "Assessment without any verified evidence.",
        evidence: [],
      },
      limitations: [],
    };

    const { html: htmlEmptyInsights } = renderResultsMarkup(emptyInsightsCtx);
    expect(
      htmlEmptyInsights.includes('id="supporting-pages-insights-section"')
    ).toBe(false);
  });

  test("6. Frontend defensive validation strips query params, blocks cross-domain/unsafe URLs, rejects unverified sourceUrl, and sanitizes overclaiming language", () => {
    const untrustedCtx: SupportingContext = {
      status: "available",
      pagesAnalyzed: [
        // Valid same-domain page with sensitive query string that must be stripped
        {
          url: "https://acmeworkflow.com/customers?session_token=secret999#section",
          category: "customers",
        },
        // Cross-domain page -> MUST BE REJECTED
        {
          url: "https://evil-phishing.org/pricing",
          category: "pricing",
        },
        // Unsafe protocol -> MUST BE REJECTED
        {
          url: "javascript:alert(1)",
          category: "features",
        },
        // Homepage root -> MUST BE REJECTED as a supporting page
        {
          url: "https://acmeworkflow.com/",
          category: "other",
        },
      ],
      trustContext: {
        status: "observed",
        // Overclaiming AI text that must be sanitized by UI layer too
        assessment:
          "This independently verified fact proves that they have 450+ enterprise customers.",
        evidence: [
          // Valid evidence matching /customers
          {
            sourceUrl: "https://acmeworkflow.com/customers?utm_source=test",
            excerpt: "Trusted by 450+ B2B revenue operations teams",
            interpretation: "Proves that 450+ teams use the platform.",
            claimBasis: "website_published_claim",
          },
          // Evidence citing an unreviewed/unfetched page -> MUST BE REJECTED
          {
            sourceUrl: "https://acmeworkflow.com/unreviewed-page",
            excerpt: "Unverified quote from another page",
          },
          // Evidence citing cross-domain URL -> MUST BE REJECTED
          {
            sourceUrl: "https://evil-phishing.org/pricing",
            excerpt: "Malicious external quote",
          },
        ],
      },
      limitations: [],
    };

    const { html } = renderResultsMarkup(untrustedCtx);

    // Only the 1 valid same-domain supporting page is rendered, with query/hash stripped
    expect(html.includes("1 page reviewed")).toBe(true);
    expect(html.includes("acmeworkflow.com/customers")).toBe(true);
    expect(html.includes("secret999")).toBe(false);
    expect(html.includes("evil-phishing.org")).toBe(false);
    expect(html.includes("javascript:alert")).toBe(false);
    expect(html.includes("Unverified quote from another page")).toBe(false);
    expect(html.includes("Malicious external quote")).toBe(false);

    // Overclaiming language is sanitized
    expect(html.toLowerCase().includes("proves that")).toBe(false);
    expect(html.toLowerCase().includes("not independently verified")).toBe(true);
  });
});
