import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { extractWebsiteSnapshot } from "@/lib/content-extractor";
import { validateAndScoreAnalysis } from "@/services/validation/analysisValidator";
import { mapBackendToFrontend } from "@/lib/mapper";
import {
  evaluateComparisonEligibility,
  METHODOLOGY_VARIABILITY_NOTE,
} from "@/lib/recheck-compare";
import { SIGNAL_WEIGHTS } from "@/services/scoring/scoringConfig";
import { calculateOverallScore } from "@/services/scoring/calculateOverallScore";
import ResultsScreen, { buildReportSummaryForExport } from "@/components/ResultsScreen";
import ScanScreen, { SCAN_FOCUS_MESSAGES } from "@/components/ScanScreen";
import LandingPage from "@/app/page";
import { LEGAL_CONFIG } from "@/lib/legal-config";
import PrivacyPolicyPage from "@/app/privacy/page";
import TermsOfServicePage from "@/app/terms/page";
import RefundPolicyPage from "@/app/refund-policy/page";
import ContactSupportPage from "@/app/contact/page";

const ARE_YOU_RARE_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <title>AreYouRare — Check how rare you really are</title>
    <meta name="description" content="Discover your statistical rarity across traits and habits." />
  </head>
  <body>
    <header>
      <nav>
        <a href="/">AreYouRare</a>
        <a href="#faq" class="btn">FAQ</a>
        <a href="/about">About</a>
      </nav>
    </header>
    <main>
      <div class="max-w-4xl mx-auto py-16">
        <h1>Check how rare you really are</h1>
        <p>Enter a few traits to calculate how uncommon your combination is.</p>
        <button type="button" class="bg-blue-600 text-white px-6 py-3 rounded">Find My Rarity</button>
      </div>
      <section id="faq">
        <h2>Frequently Asked Questions</h2>
        <p>How does the calculation work? Enter your everyday traits, habits, and preferences to see how uncommon your combination is compared with general statistical distributions.</p>
      </section>
    </main>
  </body>
</html>
`;

describe("Accuracy & Reliability — Phase 1 & Phase 2 Regression Suite", () => {
  test("TEST 1: Static HTML homepage analysis contains no unsupported viewport-observation claims", () => {
    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });
    const rawAi: any = {
      verdict: { text: "AreYouRare invites visitors to test trait rarity." },
      first_seconds: {
        what_is_this: {
          status: "partly_clear",
          explanation: "It is an interactive rarity checker.",
          evidence_refs: [{ source: "hero", text: "Check how rare you really are" }],
        },
        who_is_it_for: {
          status: "partly_clear",
          explanation: "General internet users.",
          evidence_refs: [],
        },
        what_will_i_get: {
          status: "understandable",
          explanation: "A rarity calculation.",
          evidence_refs: [
            {
              source: "hero",
              text: "Enter a few traits to calculate how uncommon your combination is.",
            },
          ],
        },
        why_should_i_care: {
          status: "unclear",
          explanation: "No external proof points present.",
          evidence_refs: [],
        },
        what_should_i_do_next: {
          status: "clear",
          explanation: "Click Find My Rarity.",
          evidence_refs: [{ source: "cta", text: "Find My Rarity" }],
        },
      },
      visitor_thought: {
        text: "I can enter my traits and click Find My Rarity to see how uncommon my combination is.",
        confidence: "medium",
      },
      website_message: {
        summary: "AreYouRare calculates how uncommon a visitor's combination of traits is.",
        confidence: "medium",
        evidence_refs: [{ source: "hero", text: "Check how rare you really are" }],
      },
      signals: {
        first_impression: {
          score: 68,
          status: "partly_clear",
          explanation: "Headline states the general idea.",
          confidence: "medium",
          evidence_refs: [{ source: "hero", text: "Check how rare you really are" }],
        },
        audience: {
          score: 55,
          status: "partly_clear",
          explanation: "No explicit audience is stated.",
          confidence: "medium",
          evidence_refs: [],
        },
        value: {
          score: 70,
          status: "understandable",
          explanation: "Explains trait calculation.",
          confidence: "medium",
          evidence_refs: [
            {
              source: "hero",
              text: "Enter a few traits to calculate how uncommon your combination is.",
            },
          ],
        },
        trust: {
          score: 45,
          status: "needs_work",
          explanation: "No third-party proof points identified.",
          confidence: "medium",
          evidence_refs: [],
        },
        action: {
          score: 82,
          status: "clear",
          explanation: "Find My Rarity CTA is clear.",
          confidence: "high",
          evidence_refs: [{ source: "cta", text: "Find My Rarity" }],
        },
      },
      risks: [],
      priority_fix: {
        title: "Clarify methodology and target audience in the hero section",
        reason: "Visitors do not see what data source powers the rarity calculation.",
        impact: "high",
        what_you_say_now: "Check how rare you really are",
        clearer_direction:
          "Check how rare you really are — Compare your traits against our statistical survey.",
      },
      other_improvements: [],
    };

    const validated = validateAndScoreAnalysis(rawAi, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot);

    assert.equal(mapped.evidence.locationTag, "Homepage · Extracted content");

    const html = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://areyourare.ai.studio",
        analysisData: mapped,
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    assert.ok(html.includes("Homepage · Extracted content"));
    assert.ok(html.includes("Based on accessible homepage content"));
    assert.ok(!html.includes("Homepage · Above the fold"));
    assert.ok(!html.includes("Evaluated from initial above-the-fold view"));
    assert.ok(!html.includes("EXTRACTED ABOVE-THE-FOLD TEXT"));
  });

  test("TEST 2: Legitimate recommendation mentioning 'above the fold' remains unchanged", () => {
    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });
    const rawAi: any = {
      verdict: { text: "Homepage is understandable." },
      first_seconds: {},
      signals: {
        first_impression: { score: 75, status: "understandable", explanation: "Clear." },
        audience: { score: 60, status: "partly_clear", explanation: "Broad." },
        value: { score: 75, status: "understandable", explanation: "Clear." },
        trust: { score: 50, status: "could_be_stronger", explanation: "Limited." },
        action: { score: 80, status: "clear", explanation: "Clear." },
      },
      priority_fix: {
        title: "Make your primary CTA visible above the fold.",
        reason: "Keeping the primary call-to-action visible above the fold reduces scrolling friction.",
        impact: "high",
        what_you_say_now: "Check how rare you really are",
        clearer_direction: "Calculate your trait rarity in 30 seconds",
      },
      other_improvements: [],
    };

    const validated = validateAndScoreAnalysis(rawAi, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot);

    assert.equal(mapped.recommendation.subhead, "Make your primary CTA visible above the fold.");
    assert.ok(mapped.recommendation.explanation.includes("above the fold"));
  });

  test("TEST 3: Previous score 66, current score 59 -> -7 points, 'Scored lower', neutral interpretation", () => {
    const res = evaluateComparisonEligibility({
      currentDomainInput: "areyourare.ai.studio",
      currentScore: 59,
      currentSignals: [],
      previousRecord: {
        domain: "areyourare.ai.studio",
        score: 66,
        date: "2026-10-01T10:00:00.000Z",
      },
      currentTimestampMs: Date.parse("2026-10-11T10:00:00.000Z"),
    });

    assert.equal(res.isEligible, true);
    assert.equal(res.overall?.beforeScore, 66);
    assert.equal(res.overall?.afterScore, 59);
    assert.equal(res.overall?.delta, -7);
    assert.equal(res.overall?.deltaText, "-7 points");
    assert.equal(res.overall?.status, "Scored lower");
    assert.equal(
      res.interpretationSummary,
      "Your latest assessment scored 7 points lower."
    );
    assert.equal(
      res.methodologyNote,
      "Scores are AI-assisted assessments of accessible website content and may vary between scans. A score change does not necessarily mean visitor behavior has changed."
    );
  });

  test("TEST 4: Previous score 59, current score 66 -> +7 points, 'Scored higher', neutral interpretation", () => {
    const res = evaluateComparisonEligibility({
      currentDomainInput: "areyourare.ai.studio",
      currentScore: 66,
      currentSignals: [],
      previousRecord: {
        domain: "areyourare.ai.studio",
        score: 59,
        date: "2026-10-01T10:00:00.000Z",
      },
      currentTimestampMs: Date.parse("2026-10-11T10:00:00.000Z"),
    });

    assert.equal(res.isEligible, true);
    assert.equal(res.overall?.beforeScore, 59);
    assert.equal(res.overall?.afterScore, 66);
    assert.equal(res.overall?.delta, 7);
    assert.equal(res.overall?.deltaText, "+7 points");
    assert.equal(res.overall?.status, "Scored higher");
    assert.equal(
      res.interpretationSummary,
      "Your latest assessment scored 7 points higher."
    );
  });

  test("TEST 5: Previous score 59, current score 59 -> 0 points, 'Score unchanged'", () => {
    const res = evaluateComparisonEligibility({
      currentDomainInput: "areyourare.ai.studio",
      currentScore: 59,
      currentSignals: [],
      previousRecord: {
        domain: "areyourare.ai.studio",
        score: 59,
        date: "2026-10-01T10:00:00.000Z",
      },
      currentTimestampMs: Date.parse("2026-10-11T10:00:00.000Z"),
    });

    assert.equal(res.isEligible, true);
    assert.equal(res.overall?.delta, 0);
    assert.equal(res.overall?.deltaText, "0 points");
    assert.equal(res.overall?.status, "Score unchanged");
  });

  test("TEST 6: Previous signal scores unavailable -> No fabricated historical signals, shows 'Not recorded in previous check.'", () => {
    const res = evaluateComparisonEligibility({
      currentDomainInput: "areyourare.ai.studio",
      currentScore: 59,
      currentSignals: [
        { id: "first-impression", score: 65 },
        { id: "audience", score: 52 },
        { id: "value", score: 64 },
        { id: "trust", score: 45 },
        { id: "action", score: 75 },
      ],
      previousRecord: {
        domain: "areyourare.ai.studio",
        score: 66,
        date: "2026-10-01T10:00:00.000Z",
      },
      currentTimestampMs: Date.parse("2026-10-11T10:00:00.000Z"),
    });

    assert.equal(res.hasHistoricalSignalScores, false);
    for (const sig of res.signals) {
      assert.equal(sig.beforeScore, null);
      assert.equal(sig.delta, null);
      assert.equal(sig.status, "Not recorded in previous check.");
    }
  });

  test("TEST 7: Comparison of two different domains -> Not treated as a valid same-website comparison", () => {
    const res = evaluateComparisonEligibility({
      currentDomainInput: "areyourare.ai.studio",
      currentScore: 59,
      currentSignals: [],
      previousRecord: {
        domain: "different-domain.com",
        score: 66,
        date: "2026-10-01T10:00:00.000Z",
      },
      currentTimestampMs: Date.parse("2026-10-11T10:00:00.000Z"),
    });

    assert.equal(res.isEligible, false);
    assert.equal(res.unavailableReason, "domain_mismatch");
    assert.equal(res.overall, null);
  });

  test("TEST 8: Missing or invalid previous score -> Graceful fallback", () => {
    const resMissing = evaluateComparisonEligibility({
      currentDomainInput: "areyourare.ai.studio",
      currentScore: 59,
      previousRecord: null,
    });
    assert.equal(resMissing.isEligible, false);
    assert.equal(resMissing.unavailableReason, "no_previous_report");

    const resInvalid = evaluateComparisonEligibility({
      currentDomainInput: "areyourare.ai.studio",
      currentScore: 59,
      previousRecord: {
        domain: "areyourare.ai.studio",
        score: 140, // out of bounds
        date: "2026-10-01T10:00:00.000Z",
      },
    });
    assert.equal(resInvalid.isEligible, false);
    assert.equal(resInvalid.unavailableReason, "invalid_score");
  });

  test("TEST 9: Phase 1 accuracy regression tests (CTA, visitor thought, unsupported claims, audience contradiction, evidence relevance)", () => {
    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });

    // 1. Primary CTA is "Find My Rarity", never "FAQ"
    assert.equal(snapshot.hero.primaryCta?.text, "Find My Rarity");
    assert.notEqual(snapshot.hero.primaryCta?.text, "FAQ");

    // 2. Feed adversarial AI output containing all 5 Phase 1 bugs
    const buggyAi: any = {
      verdict: {
        text: "Compare your traits against thousands of profiles and get detailed breakdowns with comparison charts.",
      },
      first_seconds: {
        what_is_this: {
          status: "clear",
          explanation: "Clear.",
          evidence_refs: [{ source: "hero", text: "Check how rare you really are" }],
        },
        who_is_it_for: {
          status: "clear",
          explanation: "Everyone is targeted.",
          evidence_refs: [{ source: "hero", text: "Check how rare you really are" }],
        },
        what_will_i_get: {
          status: "understandable",
          explanation: "Rarity score.",
          evidence_refs: [
            {
              source: "hero",
              text: "Enter a few traits to calculate how uncommon your combination is.",
            },
          ],
        },
        why_should_i_care: {
          status: "unclear",
          explanation: "No proof.",
          evidence_refs: [],
        },
        what_should_i_do_next: {
          status: "clear",
          explanation: "Click FAQ.",
          evidence_refs: [{ source: "cta", text: "FAQ" }],
        },
      },
      visitor_thought: {
        // Broken visitor thought with raw H1 + meta fragment
        text: "AreYouRare raises a clear question right away: H1: Check how rare you really are, though a first-time visitor still needs clearer proof.",
        confidence: "high",
      },
      website_message: {
        summary: "Compare your traits against thousands of profiles with comparison charts.",
        confidence: "high",
        evidence_refs: [],
      },
      signals: {
        first_impression: {
          score: 82,
          status: "clear",
          explanation: "Clear headline.",
          confidence: "high",
          evidence_refs: [{ source: "hero", text: "Check how rare you really are" }],
        },
        audience: {
          score: 80,
          status: "clear",
          explanation: "Target audience is clearly specified.",
          confidence: "high",
          evidence_refs: [{ source: "hero", text: "Check how rare you really are" }],
        },
        value: {
          score: 74,
          status: "understandable",
          explanation: "Clear value.",
          confidence: "medium",
          evidence_refs: [
            {
              source: "hero",
              text: "Enter a few traits to calculate how uncommon your combination is.",
            },
          ],
        },
        trust: {
          score: 45,
          status: "needs_work",
          explanation: "Limited trust.",
          confidence: "medium",
          evidence_refs: [],
        },
        action: {
          score: 85,
          status: "clear",
          explanation: "Primary CTA is FAQ.",
          confidence: "high",
          evidence_refs: [{ source: "cta", text: "FAQ" }],
        },
      },
      risks: [],
      priority_fix: {
        title: "Clarify value proposition",
        reason: "Explain what users get.",
        impact: "high",
        what_you_say_now: "Check how rare you really are",
        clearer_direction:
          "Compare your traits against thousands of profiles to get detailed breakdowns and comparison charts.",
      },
      other_improvements: [
        {
          title: "Improve subheadline",
          explanation: "Add specifics.",
          copyable_suggestion:
            "Discover your exact mathematical rarity across thousands of verified profiles.",
        },
      ],
    };

    const validated = validateAndScoreAnalysis(buggyAi, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot);

    // Issue 1: Primary CTA in findings is "Find My Rarity", never "FAQ"
    assert.ok(
      mapped.evidence.clearFindings.some((f) => f.includes("Find My Rarity")),
      "Expected Find My Rarity in clearFindings"
    );
    assert.ok(
      !mapped.evidence.clearFindings.some((f) => f.includes("“FAQ”")),
      "Must not report FAQ as Primary action"
    );

    // Issue 2: Visitor thought has no 'H1:' or meta-fragment
    assert.ok(!mapped.visitorThought.includes("H1:"));
    assert.ok(!/raises a clear question right away/i.test(mapped.visitorThought));

    // Issue 3: Unsupported marketing claims ('thousands of profiles', 'comparison charts', 'exact mathematical') are rejected
    assert.ok(!/thousands of profiles/i.test(mapped.recommendation.strongerDirection));
    assert.ok(!/comparison charts/i.test(mapped.recommendation.strongerDirection));
    assert.ok(!/thousands of profiles/i.test(mapped.verdict));
    assert.ok(
      !mapped.otherImprovements.some((imp) =>
        /thousands of verified profiles|exact mathematical/i.test(imp.copyableSuggestion || "")
      )
    );

    // Issue 4 & 5: Audience is not marked Clear when no explicit audience exists, and no contradiction between clearFindings and missingFindings
    assert.ok(validated.signals.audience.score < 70);
    assert.notEqual(validated.first_seconds.who_is_it_for.status, "clear");
    assert.notEqual(validated.first_seconds.who_is_it_for.status, "understandable");
    assert.ok(
      !mapped.evidence.clearFindings.some((f) => /^Target audience:/i.test(f)),
      "Must not include Target audience in clearFindings when audience is not explicitly stated"
    );
    assert.ok(
      mapped.evidence.missingFindings.some((f) => /Target audience/i.test(f)),
      "Expected missing target audience finding"
    );
  });

  test("TEST 10 & TEST 12: Supporting Pages Insights and all 15 report sections preserved", () => {
    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });
    const validated = validateAndScoreAnalysis({} as any, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot, {
      status: "available",
      pagesAnalyzed: [
        {
          url: "https://areyourare.ai.studio/about",
          category: "about",
          title: "About AreYouRare",
        },
      ],
      messageConsistency: {
        status: "clarifies_homepage",
        assessment: "The About page clarifies how trait combinations are evaluated.",
        evidence: [
          {
            sourceUrl: "https://areyourare.ai.studio/about",
            excerpt: "About AreYouRare methodology and probability estimates.",
            claimBasis: "directly_observed_element",
          },
        ],
      },
      limitations: [],
    });

    const html = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://areyourare.ai.studio",
        analysisData: mapped,
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    assert.ok(html.includes('id="supporting-pages-insights-section"'));
    assert.ok(html.includes('id="five-signal-overview-section"'));
    assert.ok(html.includes('id="biggest-issue-section"'));
    assert.ok(html.includes('id="priority-fix-section"'));
    assert.ok(html.includes('id="priority-fix-plan-section"'));
    assert.ok(html.includes('id="copy-ready-improvements-section"'));
    assert.ok(html.includes('id="other-improvements-section"'));
    assert.ok(html.includes('id="first-seconds-section"'));
    assert.ok(html.includes('id="visitor-impression-section"'));
    assert.ok(html.includes('id="complete-homepage-evidence-section"'));
    assert.ok(html.includes('id="five-detailed-signals-section"'));
    assert.ok(html.includes('id="communication-risks-section"'));
    assert.ok(html.includes('id="recheck-compare-section"'));
  });

  test("TEST 11: Existing homepage scoring formula and weights remain unchanged", () => {
    assert.deepEqual(SIGNAL_WEIGHTS, {
      first_impression: 0.25,
      audience: 0.2,
      value: 0.25,
      trust: 0.15,
      action: 0.15,
    });

    const calc = calculateOverallScore({
      first_impression: 80,
      audience: 60,
      value: 80,
      trust: 60,
      action: 80,
    });
    // 80*0.25 + 60*0.20 + 80*0.25 + 60*0.15 + 80*0.15 = 20 + 12 + 20 + 9 + 12 = 73
    assert.equal(calc.overallScore, 73);
  });

  test("TEST 13: Free Results UX — No duplicate quickSignal takeaway in Five Signal Overview, non-contradictory Biggest Issue, specific #1 Priority Fix guidance, and honest Copy-Ready CTA behavior", () => {
    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });
    const validated = validateAndScoreAnalysis({} as any, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot);

    // Case A: Primary risk is in 'value' (score 74) while 'trust' is lowest signal (score 45),
    // and recommendation is structural/proof-based so 0 copy-ready cards are generated.
    const customPayload = {
      ...mapped,
      signals: [
        { id: "first-impression", title: "First impression", score: 82, badgeText: "Clear", badgeType: "clear" as const, description: "Clear first impression.", icon: "eye" },
        { id: "audience", title: "Audience", score: 62, badgeText: "Partly clear", badgeType: "amber" as const, description: "Audience could be more specific.", icon: "users" },
        { id: "value", title: "Value", score: 68, badgeText: "Understandable", badgeType: "amber" as const, description: "Value is understandable.", icon: "sparkles" },
        { id: "trust", title: "Trust", score: 45, badgeText: "Needs work", badgeType: "coral" as const, description: "Trust signals are weak.", icon: "shield" },
        { id: "action", title: "Action", score: 85, badgeText: "Clear", badgeType: "clear" as const, description: "Primary CTA is clear.", icon: "arrow" },
      ],
      risks: [
        {
          category: "value",
          severity: "high" as const,
          title: "Primary outcome lacks concrete specificity",
          description: "Visitors see a general rarity calculator prompt without knowing what the output looks like.",
          why_it_matters: "Clear outcome previews increase quiz completion.",
        },
      ],
      recommendation: {
        title: "If you change only one thing",
        subhead: "Add customer logos and methodology badge below the hero",
        explanation: "Displaying visible methodology credentials directly reinforces trust for first-time visitors.",
        impact: "high" as const,
        currentDirection: "“ Check how rare you really are ”",
        strongerDirection: "Add a visible methodology note beneath the primary button.",
      },
      otherImprovements: [],
    };

    const htmlNoCopy = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://areyourare.ai.studio",
        analysisData: customPayload,
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    // 1. Five-signal snapshot phrases appear in Hero (1x) and First Few Seconds context (1x), NOT duplicated a 3rd time in Section 04 cards
    const occurrences = htmlNoCopy.split("Product category is clear").length - 1;
    assert.ok(occurrences <= 2, `Expected quickSignal string not to be duplicated in Section 04 cards, found ${occurrences}`);
    assert.ok(htmlNoCopy.includes("Product category:"));

    // 2. Section 05 Biggest Issue does not contradict itself by labeling Trust (45/100) while showing a Value risk
    const sec05Start = htmlNoCopy.indexOf('id="biggest-issue-section"');
    const sec06Start = htmlNoCopy.indexOf('id="priority-fix-section"');
    const sec05Html = htmlNoCopy.slice(sec05Start, sec06Start);
    assert.ok(sec05Html.includes("Impacted signal:"));
    assert.ok(sec05Html.includes("Value (68/100)"));
    assert.ok(!sec05Html.includes("Lowest signal: <strong class=\"text-slate-800\">Trust"));

    // 3. Section 06 #1 Priority Fix shows specific website-grounded guidance and matches the targeted signal (Trust 45/100)
    const paywallStart = htmlNoCopy.indexOf('id="paid-report-paywall-section"');
    const sec06Html = htmlNoCopy.slice(sec06Start, paywallStart);
    assert.ok(!sec06Html.includes("Focus your first edit on resolving this primary clarity gap above the fold before adjusting secondary page sections."));
    assert.ok(sec06Html.includes("WHAT VISITORS SEE NOW"));
    assert.ok(sec06Html.includes("Check how rare you really are"));
    assert.ok(sec06Html.includes("RECOMMENDED DIRECTION"));
    assert.ok(sec06Html.includes("45 / 100"));

    // 4. When copyReadyImprovements is empty, "See copy-ready wording" CTA is hidden and replaced with Action Plan link
    assert.ok(!sec06Html.includes("See copy-ready wording"));
    assert.ok(sec06Html.includes("View Action Plan"));

    // Case B: When valid copy-ready wording exists, "See copy-ready wording" CTA is rendered
    const htmlWithCopy = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://areyourare.ai.studio",
        analysisData: {
          ...customPayload,
          recommendation: {
            title: "If you change only one thing",
            subhead: "Clarify hero headline with immediate trait rarity outcome",
            explanation: "Helps visitors immediately understand the rarity score they will receive.",
            impact: "high" as const,
            currentDirection: "“ Check how rare you really are ”",
            strongerDirection: "“ See how rare your trait combination is in 30 seconds ”",
          },
        },
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );
    assert.ok(htmlWithCopy.includes("See copy-ready wording"));
  });

  test("TEST 14: Phase 2 Paywall Optimization & Compact 9-Section Premium Preview — Mobile-first checkout order, $5 & $12 plans, email input, and compact 9-section preview", () => {
    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });
    const validated = validateAndScoreAnalysis({} as any, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot);

    const html = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://areyourare.ai.studio",
        analysisData: mapped,
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    const idxPriorityFix = html.indexOf('id="priority-fix-section"');
    const idxPaywall = html.indexOf('id="paid-report-paywall-section"');
    const idxEmailInput = html.indexOf('id="paywall-email-input"');
    const idxCheckoutCta = html.indexOf("Unlock Full Report — $5");
    const idxPremiumPreview = html.indexOf('id="premium-sections-preview"');
    const idxActionPlan = html.indexOf('id="priority-fix-plan-section"');

    // 1. Paywall is positioned right after Free Preview (Section 03) and before Full Report Section 04
    assert.ok(idxPaywall > idxPriorityFix, "Expected paywall after Section 03");
    assert.ok(idxActionPlan > idxPaywall, "Expected Section 04 Action Plan after paywall");

    // 2. Mobile conversion order: Email input & Primary Checkout CTA appear BEFORE the full-report preview in DOM order
    assert.ok(idxEmailInput > idxPaywall && idxEmailInput < idxPremiumPreview);
    assert.ok(idxCheckoutCta > idxEmailInput && idxCheckoutCta < idxPremiumPreview);

    // 3. Both $5 Full Report and $12 3 Reports remain clearly available
    const paywallSlice = html.slice(idxPaywall, idxActionPlan);
    assert.ok(paywallSlice.includes("$5"));
    assert.ok(paywallSlice.includes("Full Report"));
    assert.ok(paywallSlice.includes("$12"));
    assert.ok(paywallSlice.includes("3 Reports"));
    assert.ok(paywallSlice.includes("Save $3"));

    // 4. Compact 4-Section Full Report Preview includes the four premium benefits
    for (const title of ["COMPLETE FIX PLAN", "WEBSITE MESSAGING UPGRADE", "COMPLETE VISITOR INSIGHTS", "WEBSITE IMPROVEMENT BRIEF"]) {
      assert.ok(
        paywallSlice.includes(title),
        `Expected paywall premium benefits to include ${title}`
      );
    }

    // 5. Paywall & Results footer include legal/support disclosures
    assert.ok(paywallSlice.includes('href="/refund-policy"'));
    assert.ok(paywallSlice.includes('href="/terms"'));
    assert.ok(paywallSlice.includes('href="/privacy"'));
    assert.ok(paywallSlice.includes('href="/contact"'));
  });

  test("TEST 15: Pre-Launch Legal Pages, Customer Support & Payment Trust — Privacy, Terms, Refund Policy, and Contact Support pages render required compliance content", () => {
    const privacyHtml = renderToStaticMarkup(React.createElement(PrivacyPolicyPage));
    const termsHtml = renderToStaticMarkup(React.createElement(TermsOfServicePage));
    const refundHtml = renderToStaticMarkup(React.createElement(RefundPolicyPage));
    const contactHtml = renderToStaticMarkup(React.createElement(ContactSupportPage));

    // Privacy Policy checks
    assert.ok(privacyHtml.includes("Privacy Policy"));
    assert.ok(privacyHtml.includes("localStorage"));
    assert.ok(privacyHtml.includes("Paddle"));
    assert.ok(privacyHtml.includes(LEGAL_CONFIG.supportEmail));

    // Terms of Service checks
    assert.ok(termsHtml.includes("Terms of Service"));
    assert.ok(termsHtml.includes("$5 USD"));
    assert.ok(termsHtml.includes("$12 USD"));
    assert.ok(termsHtml.includes("Merchant of Record"));

    // Refund Policy checks
    assert.ok(refundHtml.includes("Refund Policy"));
    assert.ok(refundHtml.includes("Digital report purchases are generally final once delivered."));
    assert.ok(refundHtml.includes("does not offer a separate voluntary money-back guarantee"));
    assert.ok(refundHtml.includes("https://www.paddle.com/legal/refund-policy"));
    assert.ok(refundHtml.includes("https://www.paddle.com/legal/buyer-terms"));
    assert.ok(refundHtml.includes("https://paddle.net"));
    assert.ok(refundHtml.includes(LEGAL_CONFIG.supportEmail));

    // Contact Support checks
    assert.strictEqual(LEGAL_CONFIG.supportEmail, "hello.skyorigin@gmail.com");
    assert.strictEqual("operatorLegalName" in LEGAL_CONFIG, false);
    assert.ok(contactHtml.includes("Contact Support"));
    assert.ok(contactHtml.includes("hello.skyorigin@gmail.com"));
    assert.ok(contactHtml.includes("24–48 business hours"));
  });

  test("TEST 16: Final Pre-Launch UI/UX Corrections Phase 1 — Locked section buttons do not bypass paywall, honest pre-launch checkout copy, new-tab legal links, and ScanScreen retry action", () => {
    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });
    const validated = validateAndScoreAnalysis({} as any, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot);

    const html = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://areyourare.ai.studio",
        analysisData: mapped,
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    const idxPaywall = html.indexOf('id="paid-report-paywall-section"');
    const idxActionPlan = html.indexOf('id="priority-fix-plan-section"');
    const paywallSlice = html.slice(idxPaywall, idxActionPlan);

    // 1. Locked preview items in paywall do NOT contain anchor hrefs that jump past the paywall
    assert.ok(!paywallSlice.includes('href="#priority-fix-plan-section"'));
    assert.ok(!paywallSlice.includes('href="#copy-ready-improvements-section"'));
    assert.ok(!paywallSlice.includes('href="#recheck-compare-section"'));
    assert.ok(paywallSlice.includes("COMPLETE FIX PLAN"));

    // 2. Paywall states honest one-time payment disclosure and does not claim instant paid receipt delivery
    assert.ok(paywallSlice.includes("One-time payment · No subscription"));
    assert.ok(!paywallSlice.includes("Instant access to all 9 deep-dive sections · Receipt sent to your email"));

    // 3. Legal links inside ResultsScreen open in a new tab so active report state is preserved
    assert.ok(paywallSlice.includes('href="/refund-policy"'));
    assert.ok(paywallSlice.includes('target="_blank"'));
    assert.ok(paywallSlice.includes('rel="noopener noreferrer"'));

    // 4. ScanScreen renders error state with Try again and Change URL buttons
    const scanErrorHtml = renderToStaticMarkup(
      React.createElement(ScanScreen, {
        rawUrl: "https://areyourare.ai.studio",
        isBackendReady: false,
        backendError: "Website is unreachable. Please verify the domain and ensure the site is online.",
        onRetry: () => {},
        onBackToLanding: () => {},
      })
    );
    assert.ok(scanErrorHtml.includes("CHECK FAILED"));
    assert.ok(scanErrorHtml.includes("Try again"));
    assert.ok(scanErrorHtml.includes("Change URL"));
  });

  test("TEST 17: Final Pre-Launch UI/UX Corrections Phase 2 — Non-contradictory Biggest Issue evidence, consistent Free vs Paid descriptions, and Share/Download access boundaries", () => {
    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });
    const validated = validateAndScoreAnalysis({} as any, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot);

    // 1. Issue 1: When primary risk is in 'value' (68/100) and missingFindings only has 'audience' and 'trust',
    // Section 05 PRIMARY EVIDENCE GAP must NOT contradict the left card by displaying an 'audience' finding.
    const customValueRiskPayload = {
      ...mapped,
      signals: [
        { id: "first-impression", title: "First impression", score: 82, badgeText: "Clear", badgeType: "clear" as const, description: "Clear first impression.", icon: "eye" },
        { id: "audience", title: "Audience", score: 62, badgeText: "Partly clear", badgeType: "amber" as const, description: "Audience could be more specific.", icon: "users" },
        { id: "value", title: "Value", score: 68, badgeText: "Understandable", badgeType: "amber" as const, description: "Value is understandable.", icon: "sparkles" },
        { id: "trust", title: "Trust", score: 45, badgeText: "Needs work", badgeType: "coral" as const, description: "Trust signals are weak.", icon: "shield" },
        { id: "action", title: "Action", score: 85, badgeText: "Clear", badgeType: "clear" as const, description: "Primary CTA is clear.", icon: "arrow" },
      ],
      risks: [
        {
          category: "value",
          severity: "high" as const,
          title: "Primary outcome lacks concrete specificity",
          description: "Visitors see a general rarity calculator prompt without knowing what the output looks like.",
          why_it_matters: "Clear outcome previews increase quiz completion.",
        },
      ],
    };

    const htmlValueRisk = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://areyourare.ai.studio",
        analysisData: customValueRiskPayload,
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );
    const sec05Start = htmlValueRisk.indexOf('id="biggest-issue-section"');
    const sec06Start = htmlValueRisk.indexOf('id="priority-fix-section"');
    const sec05Html = htmlValueRisk.slice(sec05Start, sec06Start);
    assert.ok(sec05Html.includes("Primary outcome lacks concrete specificity"));
    assert.ok(
      !sec05Html.includes("Target audience is not explicitly stated in hero section"),
      "Section 05 Primary Evidence Gap must not display an unrelated Audience missing finding for a Value issue"
    );
    assert.ok(
      sec05Html.includes("Primary value statement could express a more concrete, measurable visitor outcome")
    );

    // 2. Issue 2: Canonical Free Preview vs Paid Full Report descriptions are consistent across Landing Page, Paywall, and Legal Config
    const landingHtml = renderToStaticMarkup(React.createElement(LandingPage));
    for (const freeFeature of [
      "Overall first-impression score",
      "Short main verdict",
      "Five signal scores",
      "Biggest issue with evidence",
      "Your #1 priority fix",
    ]) {
      assert.ok(landingHtml.includes(freeFeature), `Expected landing page to include ${freeFeature}`);
    }
    assert.ok(LEGAL_CONFIG.pricing.freeTier.summary.includes("overall first-impression score"));
    assert.ok(LEGAL_CONFIG.pricing.singleReport.summary.includes("prioritized 1-2-3 fix plan"));
    assert.ok(LEGAL_CONFIG.pricing.threeReportPack.summary.includes("3 complete Full Reports"));

    // 3. Issue 3: Share and Download access boundaries — Unpaid export contains ONLY Free Preview summary, never locked content
    const freeExportText = buildReportSummaryForExport(mapped, false);
    assert.ok(freeExportText.includes("STRANGERLENS FREE PREVIEW SUMMARY"));
    assert.ok(freeExportText.includes("FIVE SIGNAL OVERVIEW"));
    assert.ok(freeExportText.includes("BIGGEST ISSUE + EVIDENCE"));
    assert.ok(freeExportText.includes("YOUR #1 PRIORITY FIX:"));
    // Must NOT leak locked Visitor Thought, Detailed Signal explanations, or Full Communication Risks list
    assert.ok(!freeExportText.includes("FIRST-TIME VISITOR IMPRESSION"));
    assert.ok(!freeExportText.includes(mapped.visitorThought));
    assert.ok(!freeExportText.includes("COMMUNICATION RISKS"));
    assert.ok(!freeExportText.includes("FIVE DETAILED SIGNAL BREAKDOWN"));

    // Paid/unlocked export includes full report details
    const unlockedExportText = buildReportSummaryForExport(mapped, true);
    assert.ok(unlockedExportText.includes("STRANGERLENS FULL FIRST-IMPRESSION REPORT"));
    assert.ok(unlockedExportText.includes("FIRST-TIME VISITOR IMPRESSION"));
    assert.ok(unlockedExportText.includes(mapped.visitorThought));
    assert.ok(unlockedExportText.includes("FIVE DETAILED SIGNAL BREAKDOWN"));
    assert.ok(unlockedExportText.includes("COMMUNICATION RISKS"));

    // Unpaid ResultsScreen top bar shows "Download free summary"
    assert.ok(htmlValueRisk.includes("Report actions menu"));
  });

  test("TEST 18: Final Pricing Page UX Optimization & Refund Policy Correction — Value-based pricing cards, Coming Soon disabled paid CTAs, and removal of voluntary 14-day refund guarantee", () => {
    const landingHtml = renderToStaticMarkup(React.createElement(LandingPage));
    const refundHtml = renderToStaticMarkup(React.createElement(RefundPolicyPage));
    const termsHtml = renderToStaticMarkup(React.createElement(TermsOfServicePage));
    const contactHtml = renderToStaticMarkup(React.createElement(ContactSupportPage));

    const snapshot = extractWebsiteSnapshot(ARE_YOU_RARE_HTML, { baseUrl: "https://areyourare.ai.studio" });
    const validated = validateAndScoreAnalysis({} as any, snapshot);
    const mapped = mapBackendToFrontend(validated, "https://areyourare.ai.studio", snapshot);
    const resultsHtml = renderToStaticMarkup(
      React.createElement(ResultsScreen, {
        rawUrl: "https://areyourare.ai.studio",
        analysisData: mapped,
        previousCheckRecord: null,
        onBackToLanding: () => {},
        onRunNewCheck: () => {},
        onOpenFaq: () => {},
        onOpenPricing: () => {},
      })
    );

    // 1. Free Preview ($0) card copy
    assert.ok(landingHtml.includes("Free Preview"));
    assert.ok(landingHtml.includes("$0"));
    assert.ok(landingHtml.includes("Discover what&#x27;s unclear."));
    assert.ok(landingHtml.includes("See how your website comes across to a first-time visitor."));
    assert.ok(landingHtml.includes("Analyze My Website Free →"));

    // 2. Full Report ($5) featured card copy
    assert.ok(landingHtml.includes("Full Report"));
    assert.ok(landingHtml.includes("$5"));
    assert.ok(landingHtml.includes("ONE-TIME PAYMENT"));
    assert.ok(landingHtml.includes("MOST POPULAR"));
    assert.ok(landingHtml.includes("Know exactly what to change."));
    assert.ok(landingHtml.includes("Turn your first-impression diagnosis into a clear, actionable improvement plan."));
    assert.ok(landingHtml.includes("Prioritized 1-2-3 fix plan"));
    assert.ok(landingHtml.includes("Copy-ready website rewrites"));
    assert.ok(landingHtml.includes("Detailed five-signal analysis"));
    assert.ok(landingHtml.includes("Complete homepage evidence"));
    assert.ok(landingHtml.includes("Supporting-page insights when available"));
    assert.ok(landingHtml.includes("Communication risks and recommendations"));

    // 3. 3-Report Pack ($12) card copy & credit disclosure
    assert.ok(landingHtml.includes("3-Report Pack"));
    assert.ok(landingHtml.includes("$12"));
    assert.ok(landingHtml.includes("SAVE $3"));
    assert.ok(landingHtml.includes("Improve more. Check again."));
    assert.ok(landingHtml.includes("Three complete reports for multiple websites or improvement iterations."));
    assert.ok(landingHtml.includes("3 complete Full Reports"));
    assert.ok(landingHtml.includes("All premium insights per report"));
    assert.ok(landingHtml.includes("Copy-ready recommendations"));
    assert.ok(landingHtml.includes("Useful for multiple websites"));
    assert.ok(landingHtml.includes("Useful for before/after evaluations"));
    assert.ok(landingHtml.includes("$4 per report"));
    assert.ok(landingHtml.includes("No subscription"));
    assert.ok(landingHtml.includes("2 report credits remain"));

    // 4. Truthful pre-launch CTA on paid plans and no outdated Coming Soon labels
    assert.ok(landingHtml.includes("Start with a Free Preview →"));
    assert.ok(!landingHtml.includes("Coming Soon"));
    assert.ok(!landingHtml.includes("Coming soon"));

    // 5. Payment disclosure near pricing
    assert.ok(landingHtml.includes("One-time payment · No subscription"));
    assert.ok(landingHtml.includes('href="/terms"'));
    assert.ok(landingHtml.includes('href="/privacy"'));
    assert.ok(landingHtml.includes('href="/refund-policy"'));

    // 6. No voluntary 14-day refund guarantee anywhere across landing, results, refund policy, terms, or contact
    for (const [name, pageHtml] of [
      ["Landing", landingHtml],
      ["Results", resultsHtml],
      ["RefundPolicy", refundHtml],
      ["Terms", termsHtml],
      ["Contact", contactHtml],
    ] as const) {
      assert.ok(!pageHtml.includes("14-Day Refund"), `Unexpected 14-Day Refund in ${name}`);
      assert.ok(!pageHtml.includes("14-day"), `Unexpected 14-day in ${name}`);
      assert.ok(!pageHtml.includes("fourteen (14)"), `Unexpected fourteen (14) in ${name}`);
      assert.ok(!pageHtml.includes("We gladly issue full refunds"), `Unexpected voluntary refund promise in ${name}`);
      assert.ok(!pageHtml.includes("No refunds under any circumstances"), `Unexpected statutory waiver in ${name}`);
    }

    // 7. Refund Policy contains all 7 required sections and official Paddle links
    for (const heading of [
      "1. Digital Product Purchases",
      "2. General Refund Approach",
      "3. Failed Delivery or Technical Issues",
      "4. Duplicate or Incorrect Charges",
      "5. Statutory Consumer Rights",
      "6. Paddle Refund Requests",
      "7. Customer Support",
    ]) {
      assert.ok(refundHtml.includes(heading), `Expected Refund Policy to include ${heading}`);
    }
  });

  test("TEST 19: Final Landing Page Responsive Layout & Product Preview Correction — Side-by-side desktop hero, no RGB top borders, coherent illustrative scenario, and 3-column lower showcase", () => {
    const landingHtml = renderToStaticMarkup(React.createElement(LandingPage));

    // 1. Fake example domain, fabricated sample scores, and disconnected/technical jargon removed
    assert.ok(!landingHtml.includes("EXAMPLE REPORT PREVIEW"));
    assert.ok(!landingHtml.includes("example.com"));
    assert.ok(!landingHtml.includes(">72<"));
    assert.ok(!landingHtml.includes(">67<"));
    for (const bannedText of [
      "Live HTML",
      "Grounded in HTML",
      "0–100 Deterministic Scale",
      "Extracted from page",
      "First-Impression Diagnostic Structure",
      "Visitor comprehension check",
      "Next-gen workflow platform",
      "Ship client onboarding in 5",
      "Vague feature headline",
      "bg-gradient-to-r from-[#246BFD] via-emerald-500 to-amber-500",
      "border-t-4",
    ]) {
      assert.ok(!landingHtml.includes(bannedText), `Unexpected text or RGB border in landing page: ${bannedText}`);
    }

    // 2. Desktop two-column hero layout with minmax(0,1fr) columns
    assert.ok(landingHtml.includes("md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"));

    // 3. Hero Report Preview with one unobtrusive Illustrative preview label & coherent project-management example
    const illustrativeMatches = landingHtml.match(/Illustrative preview/g) || [];
    assert.strictEqual(illustrativeMatches.length, 1, "Expected exactly one unobtrusive Illustrative preview label");
    assert.ok(landingHtml.includes("First-Impression Report"));
    assert.ok(landingHtml.includes("5 Visitor Signals"));
    assert.ok(landingHtml.includes("BIGGEST ISSUE"));
    assert.ok(landingHtml.includes("The headline doesn&#x27;t explain what the product actually helps visitors do."));
    assert.ok(landingHtml.includes("EVIDENCE:"));
    assert.ok(landingHtml.includes("Modern solutions for teams"));
    assert.ok(landingHtml.includes("#1 PRIORITY FIX"));
    assert.ok(landingHtml.includes("Explain the main benefit directly in the headline."));
    assert.ok(landingHtml.includes("BEFORE"));
    assert.ok(landingHtml.includes("AFTER"));
    assert.ok(landingHtml.includes("Plan projects, assign tasks, and track deadlines in one place."));

    // 4. Meaningful status colors on the 5 signal cards
    assert.ok(landingHtml.includes("Clear"));
    assert.ok(landingHtml.includes("Partly clear"));
    assert.ok(landingHtml.includes("Needs work"));

    // 5. Lower Showcase ("See what StrangerLens reveals.") uses responsive 3-column grid without duplicating the full report
    assert.ok(landingHtml.includes("See what StrangerLens reveals."));
    assert.ok(landingHtml.includes("Understand what&#x27;s unclear, discover the evidence, and know where to start."));
    assert.ok(landingHtml.includes("UNDERSTAND"));
    assert.ok(landingHtml.includes("First-Impression Diagnosis"));
    assert.ok(landingHtml.includes("DISCOVER"));
    assert.ok(landingHtml.includes("Biggest Issue + Evidence"));
    assert.ok(landingHtml.includes("IMPROVE"));
    assert.ok(landingHtml.includes("Priority Fix + Copy Rewrites"));

    // 6. Hero left column & CTAs preserved
    assert.ok(landingHtml.includes("Does Your Website"));
    assert.ok(landingHtml.includes("Make Sense to a"));
    assert.ok(landingHtml.includes("Stranger?"));
    assert.ok(landingHtml.includes("Analyze My Website Free →"));

    // 7. Outdated Coming Soon labels removed & FAQ closed by default
    assert.ok(!landingHtml.toLowerCase().includes("coming soon"));
    assert.ok(landingHtml.includes("Start with a Free Preview →"));
    assert.ok(!landingHtml.includes('aria-expanded="true"'));
    assert.ok(landingHtml.includes('aria-expanded="false"'));
    assert.ok(landingHtml.includes('aria-controls="faq-answer-0"'));
  });

  test("TEST 20: Final Premium Dark Scanning Screen Implementation — Minimal centered UI, 3-ring animated lens, actual domain display, 4 real stages, and 5 clarity pillars", () => {
    const scanHtml = renderToStaticMarkup(
      React.createElement(ScanScreen, {
        rawUrl: "https://www.areyourare.ai.studio/pricing?ref=test",
        isBackendReady: false,
        backendError: null,
        onBackToLanding: () => {},
        onGoToResults: () => {},
      })
    );

    // Header: StrangerLens + Cancel
    assert.ok(scanHtml.includes("StrangerLens"));
    assert.ok(scanHtml.includes("Cancel"));

    // Title: Looking at your website with fresh eyes.
    assert.ok(scanHtml.includes("Looking at your"));
    assert.ok(scanHtml.includes("website with fresh eyes."));

    // Actual domain displayed
    assert.ok(scanHtml.includes("areyourare.ai.studio"));

    // Animated lens & progress bar
    assert.ok(scanHtml.includes('role="progressbar"'));
    assert.ok(scanHtml.includes("Analysis in progress"));
    assert.ok(scanHtml.includes("w-[150px] h-[150px] sm:w-[180px] sm:h-[180px]"));

    // 4 Real Scanning stages
    assert.ok(scanHtml.includes("Website connected"));
    assert.ok(scanHtml.includes("Website content read"));
    assert.ok(scanHtml.includes("Evaluating clarity"));
    assert.ok(scanHtml.includes("Preparing results"));

    // Bottom 5 Clarity Pillars
    assert.ok(scanHtml.includes("First Impression · Audience · Value · Trust · Action"));

    // Dark theme classes
    assert.ok(scanHtml.includes("#090D15"));
    assert.ok(scanHtml.includes("#121824"));
    assert.ok(scanHtml.includes("#263044"));
    assert.ok(scanHtml.includes("#F1F5F9"));
    assert.ok(scanHtml.includes("#94A3B8"));
    assert.ok(scanHtml.includes("#3B82F6"));

    // No old simulated percentages or fake terminal logs
    const visibleText = scanHtml.replace(/<[^>]+>/g, " ");
    assert.ok(!visibleText.includes("LIVE ACTIVITY"));
    assert.ok(!visibleText.includes("1/3"));
    assert.ok(!visibleText.includes("2/3"));
    assert.ok(!visibleText.includes("3/3"));
    assert.ok(!visibleText.includes("%"));
  });
});

