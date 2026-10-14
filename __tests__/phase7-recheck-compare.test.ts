import { test, describe } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ResultsScreen, { type AnalysisData } from "../components/ResultsScreen";
import {
  normalizeComparisonDomain,
  parseStoredHistory,
  evaluateComparisonEligibility,
  syncReportWithHistoryStorage,
  METHODOLOGY_VARIABILITY_NOTE,
} from "../lib/recheck-compare";

function createMockAnalysisData(overrides?: Partial<AnalysisData>): AnalysisData {
  return {
    domain: "acme.io",
    score: 73,
    scoreStatus: "Needs work",
    verdict: "Acme clearly states its analytics workflow but lacks visible customer proof above the fold.",
    verdictSubtext: "Based on your homepage · First-time visitor perspective",
    quickSignals: [
      { label: "Clear product category", type: "clear" },
      { label: "Clear B2B audience", type: "clear" },
      { label: "Outcome is understandable", type: "amber" },
      { label: "Missing proof points", type: "coral" },
      { label: "Clear primary CTA", type: "clear" },
    ],
    firstSeconds: [
      { question: "What is this?", label: "Clear", type: "clear" },
      { question: "Who is it for?", label: "Clear", type: "clear" },
      { question: "What will I get?", label: "Partly clear", type: "partly" },
      { question: "Why should I care?", label: "Unclear", type: "unclear" },
      { question: "What should I do next?", label: "Clear", type: "clear" },
    ],
    visitorThought:
      "I can tell this is an analytics tool for product teams, but I do not see any customer proof or concrete metrics yet.",
    evidence: {
      locationTag: "Homepage · Above the fold",
      homepageExcerpt:
        "Real-time product analytics for modern SaaS teams — Track activation and retention without complex SQL.",
      clearFindings: [
        "Product category: “Real-time product analytics” is identifiable",
        "Target audience: “modern SaaS teams” is explicitly stated",
        "Primary action: “Start free trial” is prominent",
      ],
      missingFindings: [
        "Visible proof points (customer logos, metrics, or credentials) are missing above the fold",
      ],
    },
    signals: [
      {
        id: "first-impression",
        title: "First Impression",
        score: 82,
        badgeText: "Clear",
        badgeType: "clear",
        description: "The hero headline immediately identifies the product category.",
        icon: "eye",
      },
      {
        id: "audience",
        title: "Who It's For",
        score: 78,
        badgeText: "Clear",
        badgeType: "clear",
        description: "Modern SaaS teams are explicitly named in the opening copy.",
        icon: "users",
      },
      {
        id: "value",
        title: "Value",
        score: 70,
        badgeText: "Partly clear",
        badgeType: "amber",
        description: "Activation and retention tracking is mentioned, though concrete outcomes could be sharper.",
        icon: "sparkles",
      },
      {
        id: "trust",
        title: "Trust",
        score: 52,
        badgeText: "Unclear",
        badgeType: "coral",
        description: "No customer logos, security credentials, or usage metrics appear above the fold.",
        icon: "shield",
      },
      {
        id: "action",
        title: "Next Step",
        score: 84,
        badgeText: "Clear",
        badgeType: "clear",
        description: "The primary Start free trial CTA is visible and low-friction.",
        icon: "arrow",
      },
    ],
    websiteMessage: {
      summary: "Acme offers real-time product analytics for SaaS teams to track activation and retention.",
      confidence: "high",
    },
    risks: [
      {
        category: "trust",
        severity: "high",
        title: "Missing above-the-fold credibility signals",
        description: "First-time visitors see product claims without external validation or proof points.",
        why_it_matters: "Skeptical buyers may hesitate to start a trial without seeing recognizable proof.",
      },
      {
        category: "value",
        severity: "medium",
        title: "Broad outcome phrasing in subheadline",
        description: "The subheadline explains what the tool tracks without quantifying the benefit.",
        why_it_matters: "Clearer outcome specificity helps visitors compare value faster.",
      },
    ],
    recommendation: {
      title: "If you change only one thing",
      subhead: "Clarify your hero headline and subheadline outcome",
      explanation:
        "Pair your clear category statement with a specific measurable workflow benefit above the fold.",
      impact: "high",
      currentDirection:
        "Real-time product analytics for modern SaaS teams — Track activation and retention without complex SQL.",
      strongerDirection:
        "Real-time product analytics for SaaS teams — Spot activation drop-offs and boost retention without writing SQL.",
    },
    otherImprovements: [
      {
        id: "imp-trust-1",
        title: "Surface verifiable proof near the primary CTA",
        description: "Add authentic customer proof or product evidence directly below the hero CTA.",
        whyItMatters: "Reduces evaluation risk for first-time visitors before they commit to signing up.",
        whatToImprove: "Place verified customer logos or a concrete product walkthrough preview in the hero section.",
        icon: "shield",
        color: "bg-amber-50 text-amber-600",
      },
      {
        id: "imp-cta-2",
        title: "Refine primary CTA button copy",
        description: "Make the primary action label more specific to the immediate value.",
        whyItMatters: "Specific action labels reduce hesitation at the point of click.",
        whatToImprove: "Update the primary CTA button wording above the fold.",
        copyableSuggestion: "Explore live analytics demo",
        icon: "zap",
        color: "bg-blue-50 text-blue-600",
      },
    ],
    isPartialAccess: false,
    isAccessError: false,
    checkedAt: "Checked just now",
    ...overrides,
  };
}

describe("Phase 7 — Recheck & Compare + Complete 15-Section Results QA", () => {
  test("A. Current report with no history renders First-Time User Empty State and no Before/After chart", () => {
    const evalResult = evaluateComparisonEligibility({
      currentDomainInput: "acme.io",
      currentScore: 73,
      currentSignals: createMockAnalysisData().signals,
      previousRecord: null,
    });

    assert.equal(evalResult.isEligible, false);
    assert.equal(evalResult.unavailableReason, "no_previous_report");
    assert.equal(evalResult.overall, null);

    const html = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://acme.io",
        analysisData: createMockAnalysisData(),
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    assert.ok(html.includes("SEE WHETHER IT IMPROVED"));
    assert.ok(
      html.includes("Made changes to your website? Run another analysis and compare the results.")
    );
    assert.ok(html.includes("READY TO SEE WHAT CHANGED?"));
    assert.ok(
      html.includes("Make improvements to your website, then run another analysis.")
    );
    assert.ok(html.includes("CHECK MY WEBSITE AGAIN"));
    assert.ok(!html.includes("VIEW COMPARISON"));
    assert.ok(!html.includes("BEFORE → AFTER"));
  });

  test("B & G. Current report with valid previous metadata and improved score (65 -> 73, +8 points)", () => {
    const mockData = createMockAnalysisData({ score: 73 });
    const prevRecord = {
      domain: "acme.io",
      score: 65,
      date: new Date(Date.now() - 3600_000).toISOString(),
      signals: {
        "first-impression": 74,
        audience: 70,
        value: 68,
        trust: 45,
        action: 84,
      },
    };

    const evalResult = evaluateComparisonEligibility({
      currentDomainInput: "https://www.acme.io",
      currentScore: mockData.score,
      currentSignals: mockData.signals,
      previousRecord: prevRecord,
    });

    assert.equal(evalResult.isEligible, true);
    assert.equal(evalResult.overall?.beforeScore, 65);
    assert.equal(evalResult.overall?.afterScore, 73);
    assert.equal(evalResult.overall?.delta, 8);
    assert.equal(evalResult.overall?.deltaText, "+8 points");
    assert.equal(evalResult.overall?.status, "Scored higher");
    assert.equal(
      evalResult.interpretationSummary,
      "Your latest assessment scored 8 points higher."
    );
    assert.equal(evalResult.methodologyNote, METHODOLOGY_VARIABILITY_NOTE);
    assert.equal(evalResult.hasHistoricalSignalScores, true);

    const html = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://acme.io",
        analysisData: mockData,
        previousCheckRecord: prevRecord,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    assert.ok(html.includes("BEFORE → AFTER"));
    assert.ok(html.includes("+8 points"));
    assert.ok(html.includes("VIEW COMPARISON"));
    assert.ok(html.includes("Your latest assessment scored 8 points higher."));
    assert.ok(html.includes(METHODOLOGY_VARIABILITY_NOTE));
    assert.ok(!/conversion improved by/i.test(html));
    assert.ok(!/revenue increased/i.test(html));
  });

  test("C. Corrupted localStorage data is handled safely without crashing", () => {
    const malformed = parseStoredHistory("{corrupted_json");
    assert.equal(malformed.records.length, 0);
    assert.equal(malformed.hadCorruptedData, true);

    const nonArray = parseStoredHistory('{"domain":"acme.io","score":70}');
    assert.equal(nonArray.records.length, 0);
    assert.equal(nonArray.hadCorruptedData, true);

    const mixedInvalid = parseStoredHistory(
      JSON.stringify([
        null,
        { domain: "acme.io", score: "not-a-number", date: "2026-10-10T00:00:00Z" },
        { domain: "acme.io", score: 150, date: "2026-10-10T00:00:00Z" },
        { domain: "acme.io", score: -5, date: "2026-10-10T00:00:00Z" },
        { domain: "acme.io", score: 68, date: "invalid-date" },
        { domain: "acme.io", score: 64, date: "2026-10-10T01:00:00.000Z" },
      ])
    );

    assert.equal(mixedInvalid.records.length, 1);
    assert.equal(mixedInvalid.records[0].score, 64);
    assert.equal(mixedInvalid.hadCorruptedData, true);
  });

  test("D. Two reports from different domains are never compared", () => {
    const evalResult = evaluateComparisonEligibility({
      currentDomainInput: "acme.io",
      currentScore: 73,
      currentSignals: createMockAnalysisData().signals,
      previousRecord: {
        domain: "other-company.com",
        score: 60,
        date: new Date(Date.now() - 60_000).toISOString(),
      },
    });

    assert.equal(evalResult.isEligible, false);
    assert.equal(evalResult.unavailableReason, "domain_mismatch");
    assert.equal(evalResult.overall, null);
  });

  test("E. Same website with normalized URL variants matches reliably", () => {
    const variants = [
      "https://www.Acme.io/pricing?utm_source=test#hero",
      "http://acme.io/",
      "www.ACME.io",
      "acme.io:443/about",
    ];

    for (const v of variants) {
      assert.equal(normalizeComparisonDomain(v), "acme.io");
    }

    const evalResult = evaluateComparisonEligibility({
      currentDomainInput: "https://www.Acme.io/pricing?ref=1",
      currentScore: 75,
      currentSignals: createMockAnalysisData().signals,
      previousRecord: {
        domain: "http://acme.io/",
        score: 65,
        date: new Date(Date.now() - 120_000).toISOString(),
      },
    });

    assert.equal(evalResult.isEligible, true);
    assert.equal(evalResult.domain, "acme.io");
    assert.equal(evalResult.overall?.delta, 10);
  });

  test("F. Current report and previous report with identical scores shows Unchanged (0 points)", () => {
    const evalResult = evaluateComparisonEligibility({
      currentDomainInput: "acme.io",
      currentScore: 73,
      currentSignals: createMockAnalysisData().signals,
      previousRecord: {
        domain: "acme.io",
        score: 73,
        date: new Date(Date.now() - 120_000).toISOString(),
      },
    });

    assert.equal(evalResult.isEligible, true);
    assert.equal(evalResult.overall?.delta, 0);
    assert.equal(evalResult.overall?.deltaText, "0 points");
    assert.equal(evalResult.overall?.status, "Score unchanged");
    assert.equal(
      evalResult.interpretationSummary,
      "Your latest assessment scored the same as the previous check (73/100)."
    );
  });

  test("H. Declined score calculates negative delta and Scored lower status accurately", () => {
    const evalResult = evaluateComparisonEligibility({
      currentDomainInput: "acme.io",
      currentScore: 68,
      currentSignals: createMockAnalysisData({ score: 68 }).signals,
      previousRecord: {
        domain: "acme.io",
        score: 76,
        date: new Date(Date.now() - 120_000).toISOString(),
      },
    });

    assert.equal(evalResult.isEligible, true);
    assert.equal(evalResult.overall?.beforeScore, 76);
    assert.equal(evalResult.overall?.afterScore, 68);
    assert.equal(evalResult.overall?.delta, -8);
    assert.equal(evalResult.overall?.deltaText, "-8 points");
    assert.equal(evalResult.overall?.status, "Scored lower");
    assert.equal(
      evalResult.interpretationSummary,
      "Your latest assessment scored 8 points lower."
    );
  });

  test("I. Previous report missing signal-level details does not fabricate previous signal scores", () => {
    const mockData = createMockAnalysisData({ score: 73 });
    const legacyPrevRecord = {
      domain: "acme.io",
      score: 65,
      date: new Date(Date.now() - 3600_000).toISOString(),
      // No `signals` field in legacy localStorage record
    };

    const evalResult = evaluateComparisonEligibility({
      currentDomainInput: "acme.io",
      currentScore: 73,
      currentSignals: mockData.signals,
      previousRecord: legacyPrevRecord,
    });

    assert.equal(evalResult.isEligible, true);
    assert.equal(evalResult.hasHistoricalSignalScores, false);
    for (const sig of evalResult.signals) {
      assert.equal(sig.beforeScore, null);
      assert.equal(sig.delta, null);
      assert.equal(sig.status, "Not recorded in previous check.");
    }

    const html = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://acme.io",
        analysisData: mockData,
        previousCheckRecord: legacyPrevRecord,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    assert.ok(
      html.includes("Previous scan stored overall score only · No fabricated signal history")
    );
    assert.ok(html.includes("Not recorded in previous check."));
  });

  test("J. History storage sync prevents self-comparison on rerenders and preserves prior report on recheck", () => {
    const storeMap = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => storeMap.get(key) ?? null,
      setItem: (key: string, val: string) => {
        storeMap.set(key, val);
      },
    };

    const firstReportObj = createMockAnalysisData({ score: 65 });

    // First scan: no prior history
    const firstSync = syncReportWithHistoryStorage({
      reportInstanceKey: firstReportObj,
      domainInput: "https://www.acme.io",
      score: 65,
      signals: firstReportObj.signals,
      storage: mockStorage,
      nowIso: "2026-10-10T01:00:00.000Z",
    });
    assert.equal(firstSync.previousRecord, null);

    // Rerender / StrictMode remount with the exact same report object reference:
    // Must NOT treat the just-saved 65 report as its own previousRecord!
    const rerenderSync = syncReportWithHistoryStorage({
      reportInstanceKey: firstReportObj,
      domainInput: "https://www.acme.io",
      score: 65,
      signals: firstReportObj.signals,
      storage: mockStorage,
      nowIso: "2026-10-10T01:00:01.000Z",
    });
    assert.equal(rerenderSync.previousRecord, null);

    // Second scan after user clicks CHECK MY WEBSITE AGAIN (new report object reference):
    const secondReportObj = createMockAnalysisData({ score: 73 });
    const secondSync = syncReportWithHistoryStorage({
      reportInstanceKey: secondReportObj,
      domainInput: "acme.io",
      score: 73,
      signals: secondReportObj.signals,
      storage: mockStorage,
      nowIso: "2026-10-10T02:00:00.000Z",
    });

    assert.ok(secondSync.previousRecord);
    assert.equal(secondSync.previousRecord?.score, 65);
    assert.equal(secondSync.previousRecord?.domain, "acme.io");
  });

  test("K & L. All 7 logical sections render in the exact intended sequence with zero automatic AI calls or forbidden tokens", () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("Unexpected network call during ResultsScreen render");
    }) as typeof fetch;

    try {
      const html = renderToStaticMarkup(
        React.createElement(ResultsScreen, {
          rawUrl: "https://acme.io",
          analysisData: createMockAnalysisData(),
          previousCheckRecord: null,
          onBackToLanding: () => {},
          onRunNewCheck: () => {},
          onOpenFaq: () => {},
          onOpenPricing: () => {},
        })
      );

      // K: Zero automatic network / AI calls on render
      assert.equal(fetchCalled, false);

      // L: Verify the 7 logical report sections and sub-blocks appear in exact DOM order
      const orderedMarkers = [
        "First-impression report",
        'id="five-signal-overview-section"', // 01. Website Score + Main Verdict + Five Signals
        "OVERALL FIRST-IMPRESSION SCORE",
        'id="biggest-issue-section"', // 02. Biggest Issue + Actual Evidence
        'id="priority-fix-section"', // 03. Your #1 Priority Fix
        'id="priority-fix-plan-section"', // 04. Prioritized Action Plan (includes Other Improvements)
        'id="other-improvements-section"',
        'id="copy-ready-improvements-section"', // 05. Copy-Ready Improvements
        'id="detailed-evidence-insights-section"', // 06. Detailed Evidence & Insights
        'id="first-seconds-section"',
        'id="visitor-impression-section"',
        'id="complete-homepage-evidence-section"',
        'id="five-detailed-signals-section"',
        'id="communication-risks-section"',
        'id="recheck-compare-section"', // 07. Recheck & Compare
      ];

      let lastIndex = -1;
      for (const marker of orderedMarkers) {
        const idx = html.indexOf(marker);
        assert.ok(idx > lastIndex, `Expected section marker "${marker}" to appear after index ${lastIndex}, found at ${idx}`);
        // Also verify each marker appears exactly once (no section duplication)
        const secondIdx = html.indexOf(marker, idx + marker.length);
        assert.equal(secondIdx, -1, `Expected marker "${marker}" to appear only once in rendered DOM`);
        lastIndex = idx;
      }

      // Verify old LEVEL 1/2/3 headers are removed
      assert.ok(!html.includes("LEVEL 1 — INSTANT UNDERSTANDING"));
      assert.ok(!html.includes("LEVEL 2 — ACTIONABLE IMPROVEMENTS"));
      assert.ok(!html.includes("LEVEL 3 — DEEP ANALYSIS"));

      // Verify visitor impression heading renders inside Section 06
      assert.ok(html.includes("A first-time visitor would probably think"));

      // Verify Phase 4 Score Transparency & AI Disclosure in Results Hero
      assert.ok(html.includes("OVERALL FIRST-IMPRESSION SCORE"));
      assert.ok(html.includes("How is this score calculated?"));
      assert.ok(html.includes('aria-controls="score-calculation-disclosure"'));
      assert.ok(
        html.includes(
          "StrangerLens provides an AI-estimated first-impression score based on accessible homepage content. It does not measure actual visitor behavior or conversions."
        )
      );

      // Verify StrangerLens branding is present and no old Percept/ValueCheck branding appears in rendered UI
      assert.ok(html.includes("StrangerLens"));
      assert.ok(!/Percept/i.test(html));
      assert.ok(!/ValueCheck/i.test(html));

      // Verify no forbidden string artifacts appear in rendered markup
      assert.ok(!html.includes("undefined"));
      assert.ok(!html.includes("NaN"));
      assert.ok(!html.includes("[object Object]"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
