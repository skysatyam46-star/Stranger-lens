import { Type, Schema } from "@google/genai";
import { WebsiteSnapshot } from "@/lib/content-extractor";

export interface EvidenceRef {
  source: string; // e.g. "hero", "ctas", "trust_signals", "value_props", "headings"
  element?: string; // e.g. "h1", "p", "button", "a"
  text: string; // exact text from snapshot
  reason?: string; // why this evidence matters
  relevance?: "strong" | "moderate" | "weak";
}

export type DecisionStatus = "clear" | "understandable" | "partly_clear" | "unclear";
export type SignalStatus = "clear" | "understandable" | "partly_clear" | "unclear" | "needs_work" | "could_be_stronger";
export type ConfidenceLevel = "high" | "medium" | "low";
export type OverallStatus = "clear" | "needs_improvement";

export interface WebsiteAnalysis {
  analysis_version: "1.0";

  verdict: {
    status: OverallStatus;
    text: string;
  };

  first_seconds: {
    what_is_this: {
      status: DecisionStatus;
      explanation: string;
      evidence_refs: EvidenceRef[];
    };
    who_is_it_for: {
      status: DecisionStatus;
      explanation: string;
      evidence_refs: EvidenceRef[];
    };
    what_will_i_get: {
      status: DecisionStatus;
      explanation: string;
      evidence_refs: EvidenceRef[];
    };
    why_should_i_care: {
      status: DecisionStatus;
      explanation: string;
      evidence_refs: EvidenceRef[];
    };
    what_should_i_do_next: {
      status: DecisionStatus;
      explanation: string;
      evidence_refs: EvidenceRef[];
    };
  };

  visitor_thought: {
    text: string;
    confidence: ConfidenceLevel;
  };

  website_message?: {
    summary: string;
    confidence: ConfidenceLevel;
    evidence_refs: EvidenceRef[];
  };

  signals: {
    first_impression: {
      score: number; // 0..100
      status: SignalStatus;
      explanation: string;
      confidence: ConfidenceLevel;
      evidence_refs: EvidenceRef[];
    };
    audience: {
      score: number;
      status: SignalStatus;
      explanation: string;
      confidence: ConfidenceLevel;
      evidence_refs: EvidenceRef[];
    };
    value: {
      score: number;
      status: SignalStatus;
      explanation: string;
      confidence: ConfidenceLevel;
      evidence_refs: EvidenceRef[];
    };
    trust: {
      score: number;
      status: SignalStatus;
      explanation: string;
      confidence: ConfidenceLevel;
      evidence_refs: EvidenceRef[];
    };
    action: {
      score: number;
      status: SignalStatus;
      explanation: string;
      confidence: ConfidenceLevel;
      evidence_refs: EvidenceRef[];
    };
  };

  risks?: Array<{
    category: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    why_it_matters: string;
    evidence_refs: EvidenceRef[];
  }>;

  priority_fix: {
    title: string;
    reason: string;
    impact?: "high" | "medium";
    what_you_say_now?: string;
    clearer_direction?: string;
    current_direction?: string;
    suggested_direction?: string;
    evidence_refs: EvidenceRef[];
  };

  other_improvements: Array<{
    title: string;
    explanation: string;
    why_it_matters?: string;
    what_to_improve?: string;
    copyable_suggestion?: string;
    evidence_refs: EvidenceRef[];
  }>;
}

// Gemini Type Schema definition for Structured Output
const evidenceRefSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    source: { type: Type.STRING, description: "Source section e.g. hero, ctas, trust_signals, value_props, headings" },
    element: { type: Type.STRING, description: "DOM element e.g. h1, p, button" },
    text: { type: Type.STRING, description: "Exact quote or text snippet directly from snapshot" },
    reason: { type: Type.STRING, description: "Why this evidence matters to a first-time visitor" },
    relevance: { type: Type.STRING, enum: ["strong", "moderate", "weak"] },
  },
  required: ["source", "text"],
};

const firstSecondsItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING, enum: ["clear", "understandable", "partly_clear", "unclear"] },
    explanation: { type: Type.STRING, description: "Neutral diagnostic explanation for a first-time visitor" },
    evidence_refs: {
      type: Type.ARRAY,
      items: evidenceRefSchema,
    },
  },
  required: ["status", "explanation", "evidence_refs"],
};

const signalItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER, description: "Initial evaluation score from 0 to 100" },
    status: { type: Type.STRING, enum: ["clear", "understandable", "partly_clear", "unclear", "needs_work", "could_be_stronger"] },
    explanation: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
    evidence_refs: {
      type: Type.ARRAY,
      items: evidenceRefSchema,
    },
  },
  required: ["score", "status", "explanation", "confidence", "evidence_refs"],
};

export const WEBSITE_ANALYSIS_GEMINI_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    analysis_version: { type: Type.STRING, enum: ["1.0"] },

    verdict: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, enum: ["clear", "needs_improvement"] },
        text: { type: Type.STRING, description: "Concise summary explaining the primary first-impression issue" },
      },
      required: ["status", "text"],
    },

    first_seconds: {
      type: Type.OBJECT,
      properties: {
        what_is_this: firstSecondsItemSchema,
        who_is_it_for: firstSecondsItemSchema,
        what_will_i_get: firstSecondsItemSchema,
        why_should_i_care: firstSecondsItemSchema,
        what_should_i_do_next: firstSecondsItemSchema,
      },
      required: [
        "what_is_this",
        "who_is_it_for",
        "what_will_i_get",
        "why_should_i_care",
        "what_should_i_do_next",
      ],
    },

    visitor_thought: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: "Concise first-time visitor perspective (e.g. 'A first-time visitor would probably think...'). NOT a testimonial quote." },
        confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
      },
      required: ["text", "confidence"],
    },

    website_message: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: "Concise 2-3 sentence interpretation of what the website communicates to an uninitiated visitor" },
        confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
        evidence_refs: {
          type: Type.ARRAY,
          items: evidenceRefSchema,
        },
      },
      required: ["summary", "confidence", "evidence_refs"],
    },

    signals: {
      type: Type.OBJECT,
      properties: {
        first_impression: signalItemSchema,
        audience: signalItemSchema,
        value: signalItemSchema,
        trust: signalItemSchema,
        action: signalItemSchema,
      },
      required: ["first_impression", "audience", "value", "trust", "action"],
    },

    risks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, description: "Risk category e.g. clarity, audience, value, trust, action, credibility, positioning" },
          severity: { type: Type.STRING, enum: ["high", "medium", "low"] },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          why_it_matters: { type: Type.STRING },
          evidence_refs: {
            type: Type.ARRAY,
            items: evidenceRefSchema,
          },
        },
        required: ["category", "severity", "title", "description", "why_it_matters", "evidence_refs"],
      },
    },

    priority_fix: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        reason: { type: Type.STRING },
        impact: { type: Type.STRING, enum: ["high", "medium"] },
        what_you_say_now: { type: Type.STRING, description: "Actual or accurately paraphrased current website message" },
        clearer_direction: { type: Type.STRING, description: "Actionable clearer direction based on identified problem" },
        current_direction: { type: Type.STRING },
        suggested_direction: { type: Type.STRING },
        evidence_refs: {
          type: Type.ARRAY,
          items: evidenceRefSchema,
        },
      },
      required: ["title", "reason", "impact", "what_you_say_now", "clearer_direction", "evidence_refs"],
    },

    other_improvements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          explanation: { type: Type.STRING },
          why_it_matters: { type: Type.STRING },
          what_to_improve: { type: Type.STRING },
          copyable_suggestion: { type: Type.STRING },
          evidence_refs: {
            type: Type.ARRAY,
            items: evidenceRefSchema,
          },
        },
        required: ["title", "explanation", "evidence_refs"],
      },
    },
  },
  required: [
    "analysis_version",
    "verdict",
    "first_seconds",
    "visitor_thought",
    "website_message",
    "signals",
    "risks",
    "priority_fix",
    "other_improvements",
  ],
};
