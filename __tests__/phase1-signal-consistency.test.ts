import { describe, test, expect } from "./test-harness";
import { adaptReport, CanonicalReport, CanonicalSignalKey } from "../lib/report-adapter";
import { SIGNAL_WEIGHTS } from "../services/scoring/scoringConfig";

/**
 * Real report fixture matching the observed founder reproduction case:
 * Overall Score: 62
 * First Impression: 75
 * Audience: 40
 * Value: 75
 * Trust: 20
 * Action: 90
 */
function createObservedReportFixture(): any {
  return {
    domain: "fastflow.io",
    score: 62,
    scoreStatus: "Needs work",
    verdict: "FastFlow explains its page creation, but audience and trust elements need strengthening.",
    verdictSubtext: "Based on your homepage · First-time visitor perspective",
    signals: [
      {
        id: "first-impression",
        title: "First impression",
        score: 75,
        badgeText: "Understandable",
        badgeType: "clear",
        description: "Product category is clear from the hero headline, though specificity could be tighter.",
        icon: "eye",
      },
      {
        id: "audience",
        title: "Audience",
        score: 40,
        badgeText: "Unclear",
        badgeType: "coral",
        description: "Target audience is not explicitly stated in the primary hero message.",
        icon: "users",
      },
      {
        id: "value",
        title: "Value",
        score: 75,
        badgeText: "Understandable",
        badgeType: "clear",
        description: "Primary value proposition is visible, focusing on faster page deployment.",
        icon: "sparkles",
      },
      {
        id: "trust",
        title: "Trust",
        score: 20,
        badgeText: "Needs work",
        badgeType: "coral",
        description: "Verifiable credentials or customer proof points not detected in the extracted homepage content.",
        icon: "shield",
      },
      {
        id: "action",
        title: "Action",
        score: 90,
        badgeText: "Clear",
        badgeType: "clear",
        description: "Primary call to action 'Get Started Free' is distinct and prominent in hero.",
        icon: "arrow",
      },
    ],
    evidence: {
      locationTag: "Homepage · Extracted content",
      homepageExcerpt: "“ Build Websites Faster — Deploy stunning pages in under 10 minutes with AI. ”",
      clearFindings: [
        "Product category: “Build Websites Faster” is identifiable",
        "Primary outcome: “Deploy stunning pages in under 10 minutes” is stated",
        "Primary action: “Get Started Free” is present in the hero section",
      ],
      missingFindings: [
        "Target audience is not explicitly stated in hero section",
        "Verifiable proof points, customer logos, or credentials not detected in the extracted homepage content",
      ],
    },
    risks: [
      {
        category: "audience",
        severity: "high",
        title: "Ambiguous Audience",
        description: "Visitors cannot easily tell whether this is meant for solo creators, developers, or enterprise teams.",
        why_it_matters: "Visitors bounce quickly when they are unsure if a product applies to them.",
      },
      {
        category: "trust",
        severity: "high",
        title: "Missing Proof Points",
        description: "No customer metrics or reviews in initial viewport.",
        why_it_matters: "First-time visitors look for immediate reassurance.",
      },
    ],
    otherImprovements: [
      {
        id: "audience-0",
        title: "Add Target Audience Tag",
        description: "Add a clear audience tag or role qualifier directly above or below the main headline.",
        whyItMatters: "Visitors bounce within seconds if they cannot immediately confirm the product was built specifically for their needs.",
        whatToImprove: "Add a clear audience tag or role qualifier directly above or below the main headline.",
        copyableSuggestion: "“ Built specifically for marketing teams and creators looking to achieve results faster.”",
        icon: "users",
        color: "bg-purple-50 text-purple-600",
      },
      {
        id: "trust-1",
        title: "Add Credibility Badges",
        description: "Place 2–3 customer proof points, logos, or methodology credentials directly below the primary CTA.",
        whyItMatters: "First-time visitors look for immediate proof that others rely on this product.",
        whatToImprove: "Place 2–3 customer proof points, logos, or methodology credentials directly below the primary CTA.",
        copyableSuggestion: "“ Trusted by 5,000+ creators building with FastFlow.”",
        icon: "shield",
        color: "bg-blue-50 text-blue-600",
      },
    ],
  };
}

describe("StrangerLens Phase 1: Real Report Data Foundation & Five-Signal Consistency", () => {
  // TEST 1: All five signals map correctly
  test("TEST 1: All five signals map correctly with canonical keys and IDs", () => {
    const rawFixture = createObservedReportFixture();
    const canonical = adaptReport(rawFixture);

    expect(canonical.signals.firstImpression.id).toBe("first-impression");
    expect(canonical.signals.firstImpression.title).toBe("First Impression");
    expect(canonical.signals.firstImpression.score).toBe(75);

    expect(canonical.signals.audience.id).toBe("audience");
    expect(canonical.signals.audience.title).toBe("Audience");
    expect(canonical.signals.audience.score).toBe(40);

    expect(canonical.signals.value.id).toBe("value");
    expect(canonical.signals.value.title).toBe("Value");
    expect(canonical.signals.value.score).toBe(75);

    expect(canonical.signals.trust.id).toBe("trust");
    expect(canonical.signals.trust.title).toBe("Trust");
    expect(canonical.signals.trust.score).toBe(20);

    expect(canonical.signals.action.id).toBe("action");
    expect(canonical.signals.action.title).toBe("Action");
    expect(canonical.signals.action.score).toBe(90);

    expect(canonical.signalsList.length).toBe(5);
  });

  // TEST 2: Free and Premium scores match
  test("TEST 2: Free and Premium scores match identically (no deviation)", () => {
    const rawFixture = createObservedReportFixture();
    const canonical = adaptReport(rawFixture);

    const keys: CanonicalSignalKey[] = [
      "firstImpression",
      "audience",
      "value",
      "trust",
      "action",
    ];

    for (const key of keys) {
      const freeSignal = canonical.signalsList.find((s) => s.key === key);
      const paidSignal = canonical.signals[key];

      expect(freeSignal).toBeDefined();
      expect(paidSignal).toBeDefined();
      // Free score must strictly equal Paid score
      expect(freeSignal?.score).toBe(paidSignal.score);
      expect(freeSignal?.status).toBe(paidSignal.status);
      expect(freeSignal?.badgeType).toBe(paidSignal.badgeType);
    }
  });

  // TEST 3: Changing tabs updates the selected signal's real score
  test("TEST 3: Switching tabs provides the selected signal's genuine score without cross-tab corruption", () => {
    const rawFixture = createObservedReportFixture();
    const canonical = adaptReport(rawFixture);

    // Simulate tab switches in ResultsScreen:
    const activeFirstImpression = canonical.signals.firstImpression;
    expect(activeFirstImpression.score).toBe(75);

    const activeAudience = canonical.signals.audience;
    expect(activeAudience.score).toBe(40);

    const activeValue = canonical.signals.value;
    expect(activeValue.score).toBe(75);

    const activeTrust = canonical.signals.trust;
    expect(activeTrust.score).toBe(20);

    const activeAction = canonical.signals.action;
    expect(activeAction.score).toBe(90);

    // Verify distinctness:
    expect(activeAudience.score).not.toBe(activeFirstImpression.score);
    expect(activeTrust.score).not.toBe(activeAction.score);
  });

  // TEST 4: No hardcoded 85 fallback
  test("TEST 4: No hardcoded 85 fallback is used anywhere in signal scores", () => {
    const rawFixture = createObservedReportFixture();
    const canonical = adaptReport(rawFixture);

    // None of the non-85 signals should be coerced to 85
    expect(canonical.signals.firstImpression.score).toBe(75);
    expect(canonical.signals.audience.score).toBe(40);
    expect(canonical.signals.trust.score).toBe(20);
    expect(canonical.signals.action.score).toBe(90);

    // Even if an incomplete report is provided, score should be null, NEVER 85
    const incompleteReport = { domain: "empty.com", signals: [] };
    const incompleteCanonical = adaptReport(incompleteReport);

    for (const sig of incompleteCanonical.signalsList) {
      expect(sig.score).toBe(null);
      expect(sig.scoreDisplay).toBe("—/100");
    }
  });

  // TEST 5: Missing signal data does not inherit unrelated information (no cross-signal leakage)
  test("TEST 5: Missing signal data does not inherit unrelated information from other signals", () => {
    const fixture = createObservedReportFixture();
    const canonical = adaptReport(fixture);

    // Audience concerns must NOT appear in Trust
    for (const c of canonical.signals.trust.concerns) {
      expect(c.toLowerCase().includes("audience")).toBe(false);
    }

    // Trust concerns must NOT appear in Audience
    for (const c of canonical.signals.audience.concerns) {
      expect(c.toLowerCase().includes("proof points")).toBe(false);
    }

    // Audience recommendations must NOT appear in Action
    for (const r of canonical.signals.action.recommendations) {
      expect(r.toLowerCase().includes("audience tag")).toBe(false);
    }
  });

  // TEST 6: Existing status values remain unchanged
  test("TEST 6: Existing status values and badges are preserved accurately", () => {
    const rawFixture = createObservedReportFixture();
    const canonical = adaptReport(rawFixture);

    expect(canonical.signals.firstImpression.status).toBe("Understandable");
    expect(canonical.signals.firstImpression.badgeType).toBe("clear");

    expect(canonical.signals.audience.status).toBe("Unclear");
    expect(canonical.signals.audience.badgeType).toBe("coral");

    expect(canonical.signals.value.status).toBe("Understandable");
    expect(canonical.signals.value.badgeType).toBe("clear");

    expect(canonical.signals.trust.status).toBe("Needs work");
    expect(canonical.signals.trust.badgeType).toBe("coral");

    expect(canonical.signals.action.status).toBe("Clear");
    expect(canonical.signals.action.badgeType).toBe("clear");
  });

  // TEST 7: Running another scan does not show stale report data
  test("TEST 7: Running another scan updates the canonical report cleanly without stale caching", () => {
    const scan1Fixture = createObservedReportFixture();
    const canonical1 = adaptReport(scan1Fixture);
    expect(canonical1.domain).toBe("fastflow.io");
    expect(canonical1.overallScore).toBe(62);
    expect(canonical1.signals.action.score).toBe(90);

    // New scan for a different website
    const scan2Fixture = {
      domain: "saasportal.dev",
      score: 84,
      scoreStatus: "Good",
      signals: [
        { id: "first-impression", title: "First impression", score: 88, badgeText: "Clear" },
        { id: "audience", title: "Audience", score: 85, badgeText: "Clear" },
        { id: "value", title: "Value", score: 82, badgeText: "Clear" },
        { id: "trust", title: "Trust", score: 80, badgeText: "Clear" },
        { id: "action", title: "Action", score: 85, badgeText: "Clear" },
      ],
      evidence: { clearFindings: [], missingFindings: [] },
    };

    const canonical2 = adaptReport(scan2Fixture);
    expect(canonical2.domain).toBe("saasportal.dev");
    expect(canonical2.overallScore).toBe(84);
    expect(canonical2.signals.firstImpression.score).toBe(88);
    expect(canonical2.signals.audience.score).toBe(85);
    expect(canonical2.signals.trust.score).toBe(80);
  });

  // TEST 8: Overall score is read from the authoritative report
  test("TEST 8: Overall score is read directly from the authoritative report and respects weighted formula", () => {
    const rawFixture = createObservedReportFixture();
    const canonical = adaptReport(rawFixture);

    expect(canonical.overallScore).toBe(62);
    expect(canonical.overallScoreDisplay).toBe("62/100");

    // Verify mathematical correspondence with backend weights:
    // first_impression: 0.25, audience: 0.20, value: 0.25, trust: 0.15, action: 0.15
    const weightedSum =
      75 * SIGNAL_WEIGHTS.first_impression +
      40 * SIGNAL_WEIGHTS.audience +
      75 * SIGNAL_WEIGHTS.value +
      20 * SIGNAL_WEIGHTS.trust +
      90 * SIGNAL_WEIGHTS.action;

    expect(Math.round(weightedSum)).toBe(62);
    expect(canonical.overallScore).toBe(Math.round(weightedSum));
  });

  // TEST 9: Development placeholders are not presented as actual findings
  test("TEST 9: Development placeholders are eliminated and not presented as genuine findings", () => {
    // If a report has no explanations or placeholders
    const rawWithPlaceholders = {
      domain: "placeholder-test.com",
      score: 50,
      signals: [
        {
          id: "first-impression",
          score: 50,
          description: "Detailed signal explanation here.", // fake placeholder
        },
      ],
    };

    const canonical = adaptReport(rawWithPlaceholders);
    // Placeholder must be rejected and normalized to null
    expect(canonical.signals.firstImpression.explanation).toBe(null);
  });

  // TEST 10: Existing report fields remain intact
  test("TEST 10: All existing report fields remain intact on rawReport and canonical model", () => {
    const rawFixture = createObservedReportFixture();
    const canonical = adaptReport(rawFixture);

    expect(canonical.domain).toBe("fastflow.io");
    expect(canonical.firstSeconds.clearFindings.length).toBe(3);
    expect(canonical.firstSeconds.missingFindings.length).toBe(2);
    expect(canonical.rawReport).toBe(rawFixture);
  });
});
