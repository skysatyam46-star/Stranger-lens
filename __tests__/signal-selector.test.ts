import {
  classifyTextToSignal,
  resolveMainGapAndFirstStep,
  selectSignalDetails,
  analyzeCopySuggestion,
  resolveExplicitLocation,
  isInvalidWebsiteQuote,
} from "../lib/signal-selector";
import { AnalysisData } from "../components/ResultsScreen";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("Starting signal-selector test suite...");

// CASE A: Overall 56, FI 75, Aud 30, Val 60, Trust 20, Act 90.
// Main gap is Trust-related (score 20).
// First Step must address the same Trust gap or explicitly be unavailable.
// Selecting Trust must not display an unrelated Audience recommendation.
// Selecting Audience must not display a Trust fix as an Audience improvement.
// Selecting First Impression must not inherit either unrelated recommendation.
const mockCaseA: AnalysisData = {
  domain: "example.com",
  score: 56,
  scoreStatus: "Needs work",
  verdict: "Needs credibility credentials",
  verdictSubtext: "First-time visitor perspective",
  quickSignals: [],
  firstSeconds: [
    { question: "What is this?", label: "Clear", type: "clear" },
    { question: "Who is it for?", label: "Partly clear", type: "partly" },
    { question: "What will I get?", label: "Understandable", type: "clear" },
    { question: "Why should I care?", label: "Unclear", type: "unclear" },
    { question: "What should I do next?", label: "Clear", type: "clear" },
  ],
  visitorThought: "Looks interesting but I cannot verify if anyone uses it.",
  evidence: {
    locationTag: "Home page → Hero section",
    homepageExcerpt: "SuperFast API for Developers",
    clearFindings: [
      'Product category: “SuperFast API” is identifiable',
      'Target audience: “Developers” is visible',
    ],
    missingFindings: [
      "Verifiable proof points, customer logos, or credentials were not detected in the extracted content",
      "Target audience specifics are missing from secondary sections",
    ],
  },
  signals: [
    {
      id: "first-impression",
      title: "First impression",
      score: 75,
      badgeText: "Clear",
      badgeType: "clear",
      description: "Core product category is readily identifiable.",
      icon: "eye",
    },
    {
      id: "audience",
      title: "Audience",
      score: 30,
      badgeText: "Unclear",
      badgeType: "coral",
      description: "Target user roles need concrete framing.",
      icon: "users",
    },
    {
      id: "value",
      title: "Value",
      score: 60,
      badgeText: "Partly clear",
      badgeType: "amber",
      description: "Benefit could express a more concrete outcome.",
      icon: "sparkles",
    },
    {
      id: "trust",
      title: "Trust",
      score: 20,
      badgeText: "Needs work",
      badgeType: "coral",
      description: "No verified customer proof or metrics detected.",
      icon: "shield",
    },
    {
      id: "action",
      title: "Action",
      score: 90,
      badgeText: "Clear",
      badgeType: "clear",
      description: "Primary CTA is clear and low friction.",
      icon: "arrow",
    },
  ],
  risks: [
    {
      category: "trust",
      severity: "high",
      title: "Lack of Verifiable Trust Signals",
      description: "First-time visitors see no customer logos or proof points.",
      why_it_matters: "Without proof, credibility remains unverified.",
    },
    {
      category: "audience",
      severity: "medium",
      title: "Ambiguous Target Persona",
      description: "Developer role qualifiers are not detailed.",
      why_it_matters: "Visitors may not know if it fits their stack.",
    },
  ],
  recommendation: {
    title: "If you change only one thing",
    subhead: "Add Customer Proof Points",
    explanation: "Display 2-3 customer testimonials or logos below the main CTA.",
    currentDirection: "",
    strongerDirection: "Add 3 verifiable customer logos with links.",
  },
  otherImprovements: [
    {
      id: "audience-fix",
      title: "Clarify Target Audience in Hero Section",
      description: "Specify whether this API is for frontend or backend engineers.",
      whyItMatters: "Eliminates role ambiguity.",
      whatToImprove: "Add role badge above the H1.",
      copyableSuggestion: "Built specifically for backend Node.js engineers",
      icon: "users",
      color: "bg-purple-50",
    },
  ],
};

const gapA = resolveMainGapAndFirstStep(mockCaseA);
assert(gapA.primarySignalId === "trust", "Case A: primary signal must be trust (score 20)");
assert(gapA.gapTitle === "Lack of Verifiable Trust Signals", "Case A: gap title must be trust-related");
assert(
  gapA.firstStep.title === "Add Customer Proof Points",
  "Case A: first step must address Trust (matching gap)"
);

// Check selecting Trust vs Audience vs First Impression
const trustDetails = selectSignalDetails("trust", mockCaseA);
assert(
  trustDetails.recommendation?.title === "Add Customer Proof Points",
  "Selecting Trust must display Trust recommendation"
);

const audDetails = selectSignalDetails("audience", mockCaseA);
assert(
  audDetails.recommendation?.title === "Clarify Target Audience in Hero Section",
  "Selecting Audience must display Audience recommendation, NOT Trust"
);

const fiDetails = selectSignalDetails("first-impression", mockCaseA);
assert(
  fiDetails.recommendation === null,
  "Selecting First Impression must NOT inherit unrelated Trust or Audience recommendations"
);

// CASE B: Analysis contains only ONE global improvement (e.g. Trust)
const mockCaseB: AnalysisData = {
  ...mockCaseA,
  otherImprovements: [], // no other improvements
};
const audDetailsB = selectSignalDetails("audience", mockCaseB);
assert(
  audDetailsB.recommendation === null,
  "Case B: Audience must not inherit Trust recommendation when only one global improvement exists"
);

// CASE C: A signal has a score but no specific analysis
const mockCaseC: AnalysisData = {
  ...mockCaseA,
  evidence: {
    locationTag: "Home page → Hero section",
    homepageExcerpt: "",
    clearFindings: [],
    missingFindings: [],
  },
  risks: [],
  otherImprovements: [],
};
const actionDetailsC = selectSignalDetails("action", mockCaseC);
assert(actionDetailsC.score === 90, "Case C: Action maintains its score of 90");
assert(
  actionDetailsC.communicationRisk === null,
  "Case C: No communication risk should be fabricated"
);
assert(
  actionDetailsC.recommendation === null,
  "Case C: No recommendation should be fabricated"
);

// CASE D: Finding has no usable quote
const invalidQuote1 = "Homepage above-the-fold content scanned on google.com";
const invalidQuote2 = "We scanned your accessible homepage structure.";
assert(isInvalidWebsiteQuote(invalidQuote1), "Invalid scan quote must be rejected");
assert(isInvalidWebsiteQuote(invalidQuote2), "Invalid generic excerpt must be rejected");
assert(!isInvalidWebsiteQuote("The modern database for high-scale apps"), "Valid headline must not be rejected");

// CASE E: Backend provides an instruction but not rewritten copy
const analyzedInstruction = analyzeCopySuggestion(
  "Integrate a clear statement about who benefits from this discovery."
);
assert(
  analyzedInstruction.type === "RECOMMENDED_DIRECTION",
  "Case E: Instruction must be classified as RECOMMENDED_DIRECTION"
);
assert(
  analyzedInstruction.canCopy === false,
  "Case E: Instruction must NOT be copyable"
);

const analyzedCopy = analyzeCopySuggestion("The reliable API for modern fintech apps");
assert(
  analyzedCopy.type === "SUGGESTED_REPLACEMENT_COPY",
  "Case E: Real copy must be classified as SUGGESTED_REPLACEMENT_COPY"
);
assert(analyzedCopy.canCopy === true, "Case E: Real copy must be copyable");

// CASE F: Report has no reliable page-specific location
const locationF = resolveExplicitLocation(undefined, null, "");
assert(
  locationF === "Exact section not identified",
  "Case F: Missing location must return 'Exact section not identified'"
);

console.log("All signal-selector tests passed successfully!");
