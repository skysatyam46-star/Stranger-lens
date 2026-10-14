import { describe, test, expect } from "./test-harness";
import { adaptReport, CanonicalReport, CanonicalSignalKey } from "../lib/report-adapter";
import { SIGNAL_WEIGHTS } from "../services/scoring/scoringConfig";

/**
 * Fixture: Real Multi-Signal Website Report (e.g. fastflow.io)
 */
function createRealScanReport(): any {
  return {
    domain: "fastflow.io",
    score: 62,
    scoreStatus: "Needs work",
    verdict: "FastFlow communicates page creation speed, but target audience and credibility proof need work.",
    verdictSubtext: "Based on your homepage · First-time visitor perspective",
    signals: [
      {
        id: "first-impression",
        title: "First impression",
        score: 75,
        badgeText: "Understandable",
        badgeType: "clear",
        description: "Product category is identifiable from the primary hero headline.",
        evidence: [{ text: "Build Websites Faster with AI" }],
        icon: "eye",
      },
      {
        id: "audience",
        title: "Audience",
        score: 40,
        badgeText: "Unclear",
        badgeType: "coral",
        description: "Target audience is not explicitly stated in the accessible homepage content.",
        evidence: [],
        icon: "users",
      },
      {
        id: "value",
        title: "Value",
        score: 75,
        badgeText: "Understandable",
        badgeType: "clear",
        description: "Primary value proposition emphasizes fast page generation and clean templates.",
        evidence: [{ text: "Deploy stunning pages in under 10 minutes" }],
        icon: "sparkles",
      },
      {
        id: "trust",
        title: "Trust",
        score: 20,
        badgeText: "Needs work",
        badgeType: "coral",
        description: "No customer proof points, testimonials, or credentials were identified in the accessible hero content.",
        evidence: [],
        icon: "shield",
      },
      {
        id: "action",
        title: "Action",
        score: 90,
        badgeText: "Clear",
        badgeType: "clear",
        description: "Primary call to action 'Get Started Free' is distinct and visible in the hero.",
        evidence: [{ text: "Get Started Free" }],
        icon: "arrow",
      },
    ],
    evidence: {
      locationTag: "Homepage · Extracted content",
      homepageExcerpt: "“ Build Websites Faster with AI — Deploy stunning pages in under 10 minutes. ”",
      clearFindings: [
        "Product category: “Build Websites Faster with AI” is identifiable",
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
        title: "Target audience is not clearly identified",
        description: "Visitors cannot easily tell whether this is meant for solo creators, developers, or enterprise teams.",
        why_it_matters: "Visitors bounce quickly when they are unsure if a product applies to them.",
      },
      {
        category: "trust",
        severity: "high",
        title: "Missing Proof Points",
        description: "Verifiable credentials or customer proof points not detected in the extracted homepage content.",
        why_it_matters: "First-time visitors look for immediate reassurance.",
      },
    ],
    priority_fix: {
      title: "Add Target Audience Tag to Hero",
      reason: "Clarifies who the product is built for within 5 seconds.",
      impact: "high",
      what_you_say_now: "Build Websites Faster with AI",
      clearer_direction: "Built for Solo Founders & Agencies: Build Websites Faster with AI",
    },
    otherImprovements: [
      {
        id: "audience-0",
        title: "Add Target Audience Tag",
        explanation: "Helps prospective users immediately self-identify.",
        whatToImprove: "Add a clear audience tag or role qualifier directly above or below the main headline.",
      },
      {
        id: "trust-1",
        title: "Add Verified Customer Proof",
        explanation: "Reduces skepticism for cold visitors.",
        whatToImprove: "Place 2–3 customer proof points, logos, or methodology credentials directly below the primary CTA.",
      },
      {
        id: "action-2",
        title: "Clarify CTA Commitment",
        explanation: "Removes hesitation at the click point.",
        whatToImprove: "Clarify what occurs immediately after clicking 'Get Started Free'.",
      },
    ],
  };
}

describe("StrangerLens Phase 2 End-to-End QA Test Suite", () => {
  // TEST 1: Five correct Free/Paid scores
  test("1. Five correct Free and Paid scores match authoritative report without deviation", () => {
    const report = adaptReport(createRealScanReport());
    expect(report.signals.firstImpression.score).toBe(75);
    expect(report.signals.audience.score).toBe(40);
    expect(report.signals.value.score).toBe(75);
    expect(report.signals.trust.score).toBe(20);
    expect(report.signals.action.score).toBe(90);

    // Free and Premium reference the exact same signal object
    const freeFirst = report.signalsList[0];
    const paidFirst = report.signals.firstImpression;
    expect(freeFirst.score).toBe(paidFirst.score);
    expect(freeFirst.scoreDisplay).toBe("75/100");
  });

  // TEST 2: No hardcoded 85 values
  test("2. No hardcoded 85 fallback is used anywhere across the five signals", () => {
    const report = adaptReport(createRealScanReport());
    for (const sig of report.signalsList) {
      if (sig.score === 85) {
        throw new Error(`Signal ${sig.key} has unexpected score 85`);
      }
    }
    expect(true).toBe(true);
  });

  // TEST 3: All five tabs show signal-specific analysis
  test("3. All five tabs show signal-specific analysis (Why, Working, Unclear, How to Improve)", () => {
    const report = adaptReport(createRealScanReport());

    for (const key of ["firstImpression", "audience", "value", "trust", "action"] as CanonicalSignalKey[]) {
      const sig = report.signals[key];
      expect(sig.title.length > 0).toBe(true);
      expect(sig.score !== null).toBe(true);
      expect(sig.status.length > 0).toBe(true);
      expect(typeof sig.explanation).toBe("string");
      expect((sig.explanation as string).length > 10).toBe(true);
      expect(Array.isArray(sig.positiveFindings)).toBe(true);
      expect(Array.isArray(sig.concerns)).toBe(true);
      expect(Array.isArray(sig.recommendations)).toBe(true);
    }
  });

  // TEST 4: Missing signal content does not inherit another signal's data (strict isolation)
  test("4. Missing signal content does not inherit unrelated data from other signals", () => {
    const raw = createRealScanReport();
    const report = adaptReport(raw);

    // Trust should NOT contain audience recommendation
    const trustRecs = report.signals.trust.recommendations.join(" ");
    expect(trustRecs.includes("Add Target Audience Tag")).toBe(false);

    // Audience should NOT contain trust recommendation
    const audRecs = report.signals.audience.recommendations.join(" ");
    expect(audRecs.includes("logos, or methodology credentials")).toBe(false);
  });

  // TEST 5: Placeholder strings never render as production findings
  test("5. Placeholder strings never render as production findings", () => {
    const rawWithPlaceholder = {
      domain: "sample.io",
      score: 60,
      signals: [
        {
          id: "first-impression",
          score: 60,
          description: "Detailed signal explanation here. placeholder",
          status: "Needs work",
        },
      ],
    };
    const report = adaptReport(rawWithPlaceholder);
    expect(report.signals.firstImpression.explanation).toBe(null);
  });

  // TEST 6: First 5 Seconds contains real meaningful textual insights
  test("6. First 5 Seconds contains structured understandItems and missItems with title and explanation", () => {
    const report = adaptReport(createRealScanReport());
    const { understandItems, missItems } = report.firstSeconds;

    expect(understandItems.length > 0).toBe(true);
    expect(missItems.length > 0).toBe(true);

    for (const item of understandItems) {
      expect(typeof item.title).toBe("string");
      expect(item.title.length > 0).toBe(true);
      expect(typeof item.explanation).toBe("string");
      expect(item.explanation.length > 5).toBe(true);
    }

    for (const item of missItems) {
      expect(typeof item.title).toBe("string");
      expect(item.title.length > 0).toBe(true);
      expect(typeof item.explanation).toBe("string");
      expect(item.explanation.length > 5).toBe(true);
    }
  });

  // TEST 7: Status labels alone are rejected as visitor-understanding insights
  test("7. Status labels alone ('Clear', 'Unclear') are rejected as visitor-understanding insights", () => {
    const raw = {
      domain: "test.io",
      score: 70,
      evidence: {
        clearFindings: ["Clear", "Understandable", "Product category: “Tool” is identifiable"],
        missingFindings: ["Unclear", "Needs work", "Target audience: Not specified in hero"],
      },
    };
    const report = adaptReport(raw);
    for (const item of report.firstSeconds.understandItems) {
      expect(["Clear", "Understandable"].includes(item.explanation.trim())).toBe(false);
    }
    for (const item of report.firstSeconds.missItems) {
      expect(["Unclear", "Needs work"].includes(item.explanation.trim())).toBe(false);
    }
  });

  // TEST 8: Strong signals do not invent significant weaknesses
  test("8. Strong signals (>= 80 or Clear) do not invent significant weaknesses or fake fixes", () => {
    const raw = createRealScanReport();
    const report = adaptReport(raw);

    // Action has score 90 (Clear)
    const actionSig = report.signals.action;
    expect(actionSig.score).toBe(90);
    expect(actionSig.concerns.length).toBe(0);
  });

  // TEST 9: Recommendations remain related to the selected signal
  test("9. Recommendations remain related to the selected signal", () => {
    const report = adaptReport(createRealScanReport());
    const audRecs = report.signals.audience.recommendations;
    expect(audRecs.some((r) => r.toLowerCase().includes("audience"))).toBe(true);

    const trustRecs = report.signals.trust.recommendations;
    expect(trustRecs.some((r) => r.toLowerCase().includes("proof") || r.toLowerCase().includes("credentials"))).toBe(true);
  });

  // TEST 10: Incomplete AI output is handled safely without crashing
  test("10. Incomplete AI output is handled safely without crashing", () => {
    const emptyReport = adaptReport({});
    expect(emptyReport.domain).toBe("website.com");
    expect(emptyReport.overallScore).toBe(null);
    expect(emptyReport.signalsList.length).toBe(5);
    for (const s of emptyReport.signalsList) {
      expect(s.score).toBe(null);
      expect(s.hasRealScore).toBe(false);
    }
  });

  // TEST 11: Overall score remains unchanged from backend authoritative calculation
  test("11. Overall score matches authoritative scoring (62 in observed fixture)", () => {
    const report = adaptReport(createRealScanReport());
    expect(report.overallScore).toBe(62);
    expect(report.overallScoreDisplay).toBe("62/100");

    // Check against scoring weights: 75*0.25 + 40*0.2 + 75*0.25 + 20*0.15 + 90*0.15 = 18.75 + 8 + 18.75 + 3 + 13.5 = 62
    const weightedSum =
      75 * SIGNAL_WEIGHTS.first_impression +
      40 * SIGNAL_WEIGHTS.audience +
      75 * SIGNAL_WEIGHTS.value +
      20 * SIGNAL_WEIGHTS.trust +
      90 * SIGNAL_WEIGHTS.action;
    expect(Math.round(weightedSum)).toBe(62);
  });

  // TEST 12: Running a new scan updates the canonical report cleanly
  test("12. Running a new scan updates the canonical report cleanly without stale caching", () => {
    const scan1 = adaptReport(createRealScanReport());
    expect(scan1.domain).toBe("fastflow.io");
    expect(scan1.overallScore).toBe(62);

    const scan2Raw = {
      domain: "anotherapp.com",
      score: 88,
      signals: [
        { id: "first-impression", score: 90, status: "Clear", description: "Instantly clear." },
        { id: "audience", score: 85, status: "Clear", description: "Explicit audience tag." },
        { id: "value", score: 88, status: "Clear", description: "Clear proposition." },
        { id: "trust", score: 80, status: "Clear", description: "Verified reviews." },
        { id: "action", score: 95, status: "Clear", description: "Distinct primary action." },
      ],
    };
    const scan2 = adaptReport(scan2Raw);
    expect(scan2.domain).toBe("anotherapp.com");
    expect(scan2.overallScore).toBe(88);
    expect(scan2.signals.firstImpression.score).toBe(90);
    expect(scan2.signals.action.score).toBe(95);
  });
});
