import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test, expect } from "./test-harness";
import { extractWebsiteSnapshot } from "../lib/content-extractor";
import { FetchResult } from "../lib/website-fetcher";
import { generateSupportingPageContext } from "../services/ai/supportingContextAnalyzer";
import { validateAndScoreAnalysis } from "../services/validation/analysisValidator";
import { SIGNAL_WEIGHTS } from "../services/scoring/scoringConfig";
import { isSupportingPagesEnabled } from "../server/config/limits";
import { mapBackendToFrontend } from "../lib/mapper";
import ResultsScreen from "../components/ResultsScreen";
import { WebsiteAnalysis } from "../services/ai/analysisSchema";
import { RawSupportingContextAIOutput } from "../types/supportingContext";

const HOMEPAGE_URL = "https://acmeworkflow.com";

const HOMEPAGE_HTML_WITH_3_PAGES = `
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

const SUPPORTING_PAGES_HTML: Record<string, string> = {
  "https://acmeworkflow.com/pricing": `
    <!DOCTYPE html>
    <html>
      <head><title>Pricing — AcmeWorkflow</title></head>
      <body>
        <main>
          <section class="hero">
            <h1>Transparent pricing for growing revenue teams</h1>
            <p>Start with a 14-day free trial on any plan.</p>
            <a href="/signup" class="btn-primary">Start 14-Day Trial</a>
          </section>
          <section class="pricing">
            <div class="pricing-card">
              <h3>Growth Plan</h3>
              <span class="price">$79/month</span>
            </div>
          </section>
        </main>
      </body>
    </html>
  `,
  "https://acmeworkflow.com/features": `
    <!DOCTYPE html>
    <html>
      <head><title>Features — AcmeWorkflow</title></head>
      <body>
        <main>
          <section class="hero">
            <h1>Real-time bi-directional CRM synchronization</h1>
            <p>Connect Salesforce and HubSpot with zero custom code.</p>
          </section>
          <div class="feature-card">
            <h3>Instant Lead Routing</h3>
            <p>Assign inbound leads by territory and account ownership in under 5 seconds.</p>
          </div>
        </main>
      </body>
    </html>
  `,
  "https://acmeworkflow.com/customers": `
    <!DOCTYPE html>
    <html>
      <head><title>Customer Stories — AcmeWorkflow</title></head>
      <body>
        <main>
          <section class="hero">
            <h1>Trusted by 450+ B2B revenue operations teams</h1>
            <p>See how revenue leaders reduce manual pipeline updates.</p>
          </section>
          <blockquote class="testimonial">
            <p>"AcmeWorkflow cut our lead response time by 68% in the first month."</p>
            <cite>Elena Rostova, VP of RevOps at CloudScale</cite>
          </blockquote>
        </main>
      </body>
    </html>
  `,
};

function createDeterministicMockFetcher(
  overrides: Record<string, FetchResult> = {}
) {
  let fetchCalls = 0;
  const fetcher = async (
    rawUrl: string,
    normalizedUrl: string
  ): Promise<FetchResult> => {
    fetchCalls++;
    if (overrides[normalizedUrl]) {
      return overrides[normalizedUrl];
    }
    const html = SUPPORTING_PAGES_HTML[normalizedUrl];
    if (html) {
      return {
        success: true,
        originalUrl: rawUrl,
        normalizedUrl,
        finalUrl: normalizedUrl,
        domain: "acmeworkflow.com",
        status: 200,
        statusText: "OK",
        contentType: "text/html",
        contentLength: html.length,
        redirectCount: 0,
        redirectHistory: [],
        timingMs: 18,
        html,
      };
    }
    return {
      success: false,
      error: "HTTP_ERROR",
      message: "Website returned HTTP error 404 (Not Found)",
      originalUrl: rawUrl,
      normalizedUrl,
      finalUrl: normalizedUrl,
      status: 404,
      timingMs: 12,
    };
  };

  return { fetcher, getFetchCalls: () => fetchCalls };
}

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
      clearer_direction: "Automate revenue operations for B2B sales teams — used by modern RevOps teams",
      current_direction: "Automate revenue operations for B2B sales teams",
      suggested_direction: "Automate revenue operations for B2B sales teams — used by modern RevOps teams",
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

describe("Multi-Page Expansion — Phase 2 Regression & Integration Tests (Tests A–L)", () => {
  test("TEST A: Homepage with three valid supporting pages generates separate supporting context in a single AI request", async () => {
    const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
      baseUrl: HOMEPAGE_URL,
    });
    const { fetcher, getFetchCalls } = createDeterministicMockFetcher();
    let aiCallCount = 0;

    const mockAiRunner = async (): Promise<RawSupportingContextAIOutput> => {
      aiCallCount++;
      return {
        messageConsistency: {
          status: "clarifies_homepage",
          assessment:
            "The features and pricing pages directly reinforce the homepage's B2B revenue operations promise with specific CRM sync and lead-routing details.",
          evidence: [
            {
              sourceUrl: "https://acmeworkflow.com/features",
              excerpt: "Real-time bi-directional CRM synchronization",
              interpretation: "Expands on the homepage's CRM hygiene promise.",
            },
            {
              sourceUrl: "https://acmeworkflow.com/features",
              excerpt: "Assign inbound leads by territory and account ownership in under 5 seconds.",
              interpretation: "Explains the homepage's lead-routing claim.",
            },
          ],
        },
        trustContext: {
          status: "observed",
          assessment:
            "The customers page publishes a named testimonial and adoption metric (website-published claims, not independently verified).",
          evidence: [
            {
              sourceUrl: "https://acmeworkflow.com/customers",
              excerpt: "Trusted by 450+ B2B revenue operations teams",
              interpretation: "Published customer count heading.",
            },
            {
              sourceUrl: "https://acmeworkflow.com/customers",
              excerpt: "AcmeWorkflow cut our lead response time by 68% in the first month.",
              interpretation: "Published customer testimonial quote.",
            },
          ],
        },
        ctaDestination: {
          purposeClear: true,
          alignsWithCtaWording: true,
          nextActionUnderstandable: true,
          assessment:
            "The primary CTA ('See Pricing Plans') leads directly to /pricing, which displays clear plan pricing and a 14-day trial action.",
          evidence: [
            {
              sourceUrl: "https://acmeworkflow.com/pricing",
              excerpt: "Transparent pricing for growing revenue teams",
            },
          ],
        },
      };
    };

    const result = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      HOMEPAGE_HTML_WITH_3_PAGES,
      {
        enabled: true,
        fetcher,
        aiRunner: mockAiRunner,
      }
    );

    expect(getFetchCalls()).toBe(3);
    expect(aiCallCount).toBe(1); // At most ONE AI call for all supporting pages combined
    expect(result.supportingContext).toBeDefined();
    expect(result.supportingContext?.status).toBe("available");
    expect(result.supportingContext?.pagesAnalyzed.length).toBe(3);
    expect(result.supportingContext?.messageConsistency?.evidence.length).toBe(2);
    expect(result.supportingContext?.trustContext?.evidence.length).toBe(2);
    expect(result.supportingContext?.ctaDestination?.inspectable).toBe(true);
    expect(result.supportingContext?.ctaDestination?.purposeClear).toBe(true);
  });

  test("TEST B: Homepage with no supporting pages returns unchanged homepage report and makes 0 supporting AI calls", async () => {
    const htmlWithNoSupportingLinks = `
      <html>
        <body>
          <header><a href="/">Home</a><a href="/login">Login</a></header>
          <main>
            <h1>Automate revenue operations for B2B sales teams</h1>
            <a href="/signup" class="btn-primary">Start Free Trial</a>
          </main>
          <footer><a href="/privacy">Privacy Policy</a></footer>
        </body>
      </html>
    `;
    const homepageSnapshot = extractWebsiteSnapshot(htmlWithNoSupportingLinks, {
      baseUrl: HOMEPAGE_URL,
    });
    const { fetcher, getFetchCalls } = createDeterministicMockFetcher();
    let aiCallCount = 0;

    const result = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      htmlWithNoSupportingLinks,
      {
        enabled: true,
        fetcher,
        aiRunner: async () => {
          aiCallCount++;
          return {};
        },
      }
    );

    expect(getFetchCalls()).toBe(0);
    expect(aiCallCount).toBe(0);
    expect(result.supportingContext?.status).toBe("unavailable");
    expect(result.supportingContext?.pagesAnalyzed.length).toBe(0);
    expect(result.supportingContext?.limitations.length).toBeGreaterThan(0);
  });

  test("TEST C: One supporting page fails -> returns partial context with remaining pages and records limitation", async () => {
    const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
      baseUrl: HOMEPAGE_URL,
    });
    const { fetcher } = createDeterministicMockFetcher({
      "https://acmeworkflow.com/customers": {
        success: false,
        error: "WEBSITE_FETCH_TIMEOUT",
        message: "Website fetch timed out after 5 seconds",
        originalUrl: "https://acmeworkflow.com/customers",
        normalizedUrl: "https://acmeworkflow.com/customers",
        finalUrl: "https://acmeworkflow.com/customers",
        timingMs: 5000,
      },
    });

    const result = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      HOMEPAGE_HTML_WITH_3_PAGES,
      {
        enabled: true,
        fetcher,
        aiRunner: async () => ({
          messageConsistency: {
            status: "consistent",
            assessment: "Features and pricing pages align with the homepage promise.",
            evidence: [
              {
                sourceUrl: "https://acmeworkflow.com/features",
                excerpt: "Real-time bi-directional CRM synchronization",
              },
            ],
          },
        }),
      }
    );

    expect(result.supportingContext?.status).toBe("partial");
    expect(result.supportingContext?.pagesAnalyzed.length).toBe(2);
    expect(
      result.supportingContext?.limitations.some((l) =>
        l.includes("https://acmeworkflow.com/customers")
      )
    ).toBe(true);
  });

  test("TEST D: Supporting-context AI call fails -> homepage result remains successful and supporting context degrades gracefully", async () => {
    const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
      baseUrl: HOMEPAGE_URL,
    });
    const homepageValidated = validateAndScoreAnalysis(
      createMockHomepageAiAnalysis(),
      homepageSnapshot
    );
    const { fetcher } = createDeterministicMockFetcher();

    const result = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      HOMEPAGE_HTML_WITH_3_PAGES,
      {
        enabled: true,
        fetcher,
        aiRunner: async () => {
          throw new Error("Simulated AI provider 503 outage");
        },
      }
    );

    // Homepage report is completely intact
    expect(homepageValidated.overall_score).toBe(79);
    // Supporting context degrades gracefully to deterministic extraction with partial status
    expect(result.supportingContext?.status).toBe("partial");
    expect(result.supportingContext?.pagesAnalyzed.length).toBe(3);
    expect(
      result.supportingContext?.limitations.some((l) =>
        l.includes("AI supporting-context synthesis was unavailable")
      )
    ).toBe(true);
    expect(
      result.supportingContext?.messageConsistency?.evidence.length
    ).toBeGreaterThan(0);
  });

  test("TEST E: Supporting page credibility claims are attributed as website-published claims, never independently verified facts", async () => {
    const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
      baseUrl: HOMEPAGE_URL,
    });
    const { fetcher } = createDeterministicMockFetcher();

    const result = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      HOMEPAGE_HTML_WITH_3_PAGES,
      {
        enabled: true,
        fetcher,
        aiRunner: async () => ({
          trustContext: {
            status: "observed",
            // Intentionally overclaiming AI wording to verify qualification sanitizer
            assessment:
              "This independently verified fact proves that they have 450+ customers and verified customer testimonials.",
            evidence: [
              {
                sourceUrl: "https://acmeworkflow.com/customers",
                excerpt: "Trusted by 450+ B2B revenue operations teams",
                interpretation: "Proves that 450+ teams use the platform.",
              },
              {
                sourceUrl: "https://acmeworkflow.com/customers",
                excerpt:
                  "AcmeWorkflow cut our lead response time by 68% in the first month.",
                interpretation: "Verified fact from VP of RevOps.",
              },
            ],
          },
        }),
      }
    );

    const trust = result.supportingContext?.trustContext;
    expect(trust).toBeDefined();
    expect(trust?.evidence.length).toBe(2);
    expect(trust?.evidence[0].claimBasis).toBe("website_published_claim");
    expect(trust?.evidence[1].claimBasis).toBe("website_published_claim");

    // Overclaiming language ("independently verified", "proves that", "verified fact") must be sanitized
    expect(trust?.assessment.toLowerCase().includes("proves that")).toBe(false);
    expect(trust?.assessment.toLowerCase().includes("not independently verified")).toBe(
      true
    );
    expect(
      trust?.evidence[1].interpretation?.toLowerCase().includes("verified fact")
    ).toBe(false);
  });

  test("TEST F: Homepage and supporting pages differ -> reports only evidence-backed consistency findings", async () => {
    const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
      baseUrl: HOMEPAGE_URL,
    });
    const { fetcher } = createDeterministicMockFetcher({
      "https://acmeworkflow.com/features": {
        success: true,
        originalUrl: "https://acmeworkflow.com/features",
        normalizedUrl: "https://acmeworkflow.com/features",
        finalUrl: "https://acmeworkflow.com/features",
        domain: "acmeworkflow.com",
        status: 200,
        statusText: "OK",
        contentType: "text/html",
        contentLength: 300,
        redirectCount: 0,
        redirectHistory: [],
        timingMs: 15,
        html: `<html><body><main><h1>Consumer photo editing filters for mobile creators</h1><p>Apply vintage camera presets to social stories.</p></main></body></html>`,
      },
    });

    const result = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      HOMEPAGE_HTML_WITH_3_PAGES,
      {
        enabled: true,
        fetcher,
        aiRunner: async () => ({
          messageConsistency: {
            status: "divergent",
            assessment:
              "While the homepage promises B2B revenue operations automation, the /features page describes consumer photo editing filters for mobile creators.",
            evidence: [
              {
                sourceUrl: "https://acmeworkflow.com/features",
                excerpt: "Consumer photo editing filters for mobile creators",
                interpretation: "Directly diverges from the homepage B2B RevOps positioning.",
              },
            ],
          },
        }),
      }
    );

    expect(result.supportingContext?.messageConsistency?.status).toBe("divergent");
    expect(result.supportingContext?.messageConsistency?.evidence.length).toBe(1);
    expect(result.supportingContext?.messageConsistency?.evidence[0].sourceUrl).toBe(
      "https://acmeworkflow.com/features"
    );
    expect(result.supportingContext?.messageConsistency?.evidence[0].excerpt).toBe(
      "Consumer photo editing filters for mobile creators"
    );
  });

  test("TEST G: CTA destination unavailable (points to /signup auth flow) -> returns honest non-followed limitation", async () => {
    const htmlWithSignupCta = HOMEPAGE_HTML_WITH_3_PAGES.replace(
      `<a href="/pricing" class="btn-primary">See Pricing Plans</a>`,
      `<a href="/signup" class="btn-primary">Start Free Trial</a>`
    );
    const homepageSnapshot = extractWebsiteSnapshot(htmlWithSignupCta, {
      baseUrl: HOMEPAGE_URL,
    });
    const { fetcher } = createDeterministicMockFetcher();

    const result = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      htmlWithSignupCta,
      {
        enabled: true,
        fetcher,
        aiRunner: async () => ({}),
      }
    );

    const ctaDest = result.supportingContext?.ctaDestination;
    expect(ctaDest).toBeDefined();
    expect(ctaDest?.inspectable).toBe(false);
    expect(ctaDest?.ctaText).toBe("Start Free Trial");
    expect(ctaDest?.evidence.length).toBe(0);
    expect(
      ctaDest?.assessment.includes("not executed or crawled") ||
        ctaDest?.assessment.includes("not followed")
    ).toBe(true);
    expect(
      result.supportingContext?.limitations.some((l) => l.includes("/signup"))
    ).toBe(true);
  });

  test("TEST H & TEST I: Rejects cross-page quote misattribution, homepage self-attribution, unknown URLs, and fabricated quotes", async () => {
    const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
      baseUrl: HOMEPAGE_URL,
    });
    const { fetcher } = createDeterministicMockFetcher();

    const result = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      HOMEPAGE_HTML_WITH_3_PAGES,
      {
        enabled: true,
        fetcher,
        aiRunner: async () => ({
          messageConsistency: {
            status: "consistent",
            assessment: "Supporting pages align with the homepage.",
            evidence: [
              // 1. Valid quote from /features attributed to /features -> KEEP
              {
                sourceUrl: "https://acmeworkflow.com/features",
                excerpt: "Real-time bi-directional CRM synchronization",
              },
              // 2. Cross-page misattribution: quote from /pricing attributed to /features -> REJECT
              {
                sourceUrl: "https://acmeworkflow.com/features",
                excerpt: "Transparent pricing for growing revenue teams",
              },
              // 3. Homepage quote attributed to /pricing -> REJECT
              {
                sourceUrl: "https://acmeworkflow.com/pricing",
                excerpt: "Automate revenue operations for B2B sales teams",
              },
              // 4. Homepage URL cited as sourceUrl -> REJECT
              {
                sourceUrl: "https://acmeworkflow.com",
                excerpt: "Automate revenue operations for B2B sales teams",
              },
              // 5. Unfetched / unknown URL cited -> REJECT
              {
                sourceUrl: "https://acmeworkflow.com/enterprise",
                excerpt: "Real-time bi-directional CRM synchronization",
              },
              // 6. Completely fabricated hallucinated quote -> REJECT
              {
                sourceUrl: "https://acmeworkflow.com/features",
                excerpt: "Includes autonomous AI voice cold-calling agents in 40 languages",
              },
            ],
          },
        }),
      }
    );

    const verifiedEv =
      result.supportingContext?.messageConsistency?.evidence || [];
    expect(verifiedEv.length).toBe(1);
    expect(verifiedEv[0].sourceUrl).toBe("https://acmeworkflow.com/features");
    expect(verifiedEv[0].excerpt).toBe(
      "Real-time bi-directional CRM synchronization"
    );
  });

  test("TEST J: Homepage-only scoring isolation — supporting context never alters homepage signal scores, weights, or overall score", async () => {
    expect(SIGNAL_WEIGHTS).toEqual({
      first_impression: 0.25,
      audience: 0.2,
      value: 0.25,
      trust: 0.15,
      action: 0.15,
    });

    const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
      baseUrl: HOMEPAGE_URL,
    });
    const baselineValidated = validateAndScoreAnalysis(
      createMockHomepageAiAnalysis(),
      homepageSnapshot
    );

    const { fetcher } = createDeterministicMockFetcher();
    const supportingResult = await generateSupportingPageContext(
      homepageSnapshot,
      HOMEPAGE_URL,
      HOMEPAGE_HTML_WITH_3_PAGES,
      {
        enabled: true,
        fetcher,
        aiRunner: async () => ({
          trustContext: {
            status: "observed",
            assessment: "Customers page contains published testimonials.",
            evidence: [
              {
                sourceUrl: "https://acmeworkflow.com/customers",
                excerpt: "Trusted by 450+ B2B revenue operations teams",
              },
            ],
          },
        }),
      }
    );

    const afterSupportingValidated = validateAndScoreAnalysis(
      createMockHomepageAiAnalysis(),
      homepageSnapshot
    );

    expect(supportingResult.supportingContext?.status).toBe("available");
    expect(afterSupportingValidated.overall_score).toBe(
      baselineValidated.overall_score
    );
    expect(afterSupportingValidated.signals.first_impression.score).toBe(
      baselineValidated.signals.first_impression.score
    );
    expect(afterSupportingValidated.signals.audience.score).toBe(
      baselineValidated.signals.audience.score
    );
    expect(afterSupportingValidated.signals.value.score).toBe(
      baselineValidated.signals.value.score
    );
    expect(afterSupportingValidated.signals.trust.score).toBe(
      baselineValidated.signals.trust.score
    );
    expect(afterSupportingValidated.signals.action.score).toBe(
      baselineValidated.signals.action.score
    );
  });

  test("TEST K: Existing frontend contract — mapBackendToFrontend and ResultsScreen render identically with or without supportingContext", () => {
    const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
      baseUrl: HOMEPAGE_URL,
    });
    const validatedWithoutSupporting = validateAndScoreAnalysis(
      createMockHomepageAiAnalysis(),
      homepageSnapshot
    );
    const validatedWithSupporting = {
      ...validatedWithoutSupporting,
      supportingContext: {
        status: "available" as const,
        pagesAnalyzed: [
          {
            url: "https://acmeworkflow.com/pricing",
            category: "pricing",
            title: "Pricing — AcmeWorkflow",
          },
        ],
        limitations: [],
      },
    };

    const mappedA = mapBackendToFrontend(
      validatedWithoutSupporting,
      HOMEPAGE_URL,
      homepageSnapshot
    );
    const mappedB = mapBackendToFrontend(
      validatedWithSupporting,
      HOMEPAGE_URL,
      homepageSnapshot
    );

    expect(mappedA.score).toBe(mappedB.score);
    expect(mappedA.signals).toEqual(mappedB.signals);

    const htmlA = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: HOMEPAGE_URL,
        analysisData: mappedA,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );
    const htmlB = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: HOMEPAGE_URL,
        analysisData: mappedB,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    expect(htmlA).toBe(htmlB);
    expect(htmlA.includes("acmeworkflow.com")).toBe(true);
  });

  test("TEST L: Feature disabled by default — performs 0 supporting-page fetches and 0 additional AI calls when disabled", async () => {
    const prevEnv = process.env.ENABLE_SUPPORTING_PAGES_ANALYSIS;
    delete process.env.ENABLE_SUPPORTING_PAGES_ANALYSIS;
    try {
      // Verify default feature flag state is OFF (false)
      expect(isSupportingPagesEnabled()).toBe(false);

      const homepageSnapshot = extractWebsiteSnapshot(HOMEPAGE_HTML_WITH_3_PAGES, {
        baseUrl: HOMEPAGE_URL,
      });
      const { fetcher, getFetchCalls } = createDeterministicMockFetcher();
      let aiCallCount = 0;

      // Call without `enabled: true` (uses default OFF state)
      const defaultResult = await generateSupportingPageContext(
        homepageSnapshot,
        HOMEPAGE_URL,
        HOMEPAGE_HTML_WITH_3_PAGES,
        {
          fetcher,
          aiRunner: async () => {
            aiCallCount++;
            return {};
          },
        }
      );

      expect(getFetchCalls()).toBe(0);
      expect(aiCallCount).toBe(0);
      expect(defaultResult.supportingContext).toBe(undefined);
      expect(defaultResult.supportingPagesBundle).toBe(undefined);
    } finally {
      if (prevEnv !== undefined) {
        process.env.ENABLE_SUPPORTING_PAGES_ANALYSIS = prevEnv;
      }
    }
  });
});
