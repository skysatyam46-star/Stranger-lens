import { WebsiteSnapshot } from "@/lib/content-extractor";
import { SERVER_LIMITS } from "@/server/config/limits";

export const ANALYSIS_VERSION = "1.0";

/**
 * Serializes WebsiteSnapshot into a clean, token-efficient JSON format for LLM context,
 * bounded by SERVER_LIMITS.AI_MAX_INPUT_TOKENS (~4 chars/token).
 */
export function formatSnapshotForAi(snapshot: WebsiteSnapshot): string {
  const compactPayload = {
    meta: {
      title: snapshot.meta.title.slice(0, 300),
      description: snapshot.meta.description.slice(0, 500),
    },
    navigation: {
      brandName: snapshot.navigation.brandName?.slice(0, 120),
      navLinks: snapshot.navigation.primaryNavLinks.slice(0, 10).map((l) => l.text.slice(0, 80)),
    },
    hero: {
      headline: snapshot.hero.headline.slice(0, 400),
      subheadline: snapshot.hero.subheadline.slice(0, 600),
      primaryCta: snapshot.hero.primaryCta ? snapshot.hero.primaryCta.text.slice(0, 100) : undefined,
      secondaryCta: snapshot.hero.secondaryCta ? snapshot.hero.secondaryCta.text.slice(0, 100) : undefined,
    },
    ctas: snapshot.ctas.slice(0, 15).map((c) => ({
      text: c.text.slice(0, 100),
      type: c.type,
      location: c.location,
    })),
    valueProps: {
      topHeadings: snapshot.valueProps.headings.slice(0, 10).map((h) => `H${h.level}: ${h.text.slice(0, 200)}`),
      featureCards: snapshot.valueProps.featureCards.slice(0, 8).map((fc) => ({
        title: fc.title.slice(0, 150),
        description: fc.description.slice(0, 300),
      })),
      pricingSignals: snapshot.valueProps.pricingSignals,
    },
    trustSignals: {
      socialProofHeadings: snapshot.trustSignals.socialProofHeadings.slice(0, 8).map((s) => s.slice(0, 200)),
      statsAndMetrics: snapshot.trustSignals.statsAndMetrics.slice(0, 8).map((s) => s.slice(0, 120)),
      testimonials: snapshot.trustSignals.testimonials.slice(0, 5).map((t) => ({
        quote: t.quote.slice(0, 400),
        author: t.author?.slice(0, 100),
      })),
      badgesAndCertifications: snapshot.trustSignals.badgesAndCertifications.slice(0, 10),
      customerLogosAlt: snapshot.trustSignals.customerLogosAlt.slice(0, 15).map((c) => c.slice(0, 80)),
    },
    sections: snapshot.bodySections.slice(0, 8).map((s) => ({
      type: s.typeHint,
      heading: s.heading?.slice(0, 200),
      textSummary: s.textSummary.slice(0, 350),
      bullets: s.bulletPoints.slice(0, 6).map((b) => b.slice(0, 150)),
    })),
    forms: snapshot.forms.slice(0, 5).map((f) => ({
      type: f.typeHint,
      fieldsCount: f.fields.length,
      submitLabel: f.submitLabel?.slice(0, 100),
    })),
  };

  const serialized = JSON.stringify(compactPayload, null, 2);
  const maxChars = SERVER_LIMITS.AI_MAX_INPUT_TOKENS * 4;
  return serialized.length > maxChars ? serialized.slice(0, maxChars) : serialized;
}

export const SYSTEM_PROMPT = `You are Percept, the definitive website first-impression diagnostic engine.

Your core purpose is to evaluate a website homepage ONLY from the perspective of an unbiased first-time visitor scanning it for the first 5 seconds.

ABSOLUTE SOURCE OF TRUTH:
WebsiteSnapshot is the absolute, exclusive source of truth. You must ONLY make claims supported by the actual WebsiteSnapshot.
DO NOT INVENT: features, customers, statistics, testimonials, audience, pricing, guarantees, trust signals, product capabilities, company information, or results.
If something is not present on the website, state honestly that it is not clearly communicated or not found. NEVER fill gaps with assumptions.

CRITICAL CONSTRAINTS & ACCURACY RULES:
1. Grounding & Verbatim Evidence: Every quote in 'evidence_refs' MUST be EXACT, VERBATIM text from the snapshot. Each evidence object must have source ('hero', 'section', 'cta', 'metadata', 'footer'), element ('h1', 'p', 'button', 'heading'), exact text, and a concise 'reason' explaining why it matters. If evidence is lacking, return [].
2. First Impression Priority: Evaluate ONLY what a stranger understands immediately above the fold: (1) hero H1, (2) hero supporting text, (3) primary CTA, (4) above-the-fold content. Deep-page details do NOT improve First Impression.
3. Audience Rules: Do NOT infer an audience merely from the product nature. Only score audience clarity if explicitly communicated ("for X", specific user role, named customer type). If not explicitly stated, state "The intended audience is not explicitly stated" and mark as unclear.
4. Value Rules: Separate FEATURE (what it is/does) from BENEFIT (how it helps) from OUTCOME (what the user achieves). The score reflects whether the outcome/benefit is immediately obvious, not the volume of text.
5. Trust Rules: Visible, verifiable proof ONLY: testimonials, named customers, client logos, case studies, verified stats with context/source/methodology, credentials, security/privacy disclosures. A raw number or percentage without methodology or source is NOT strong trust. Generic marketing claims ("trusted by thousands", "best in class") without proof are NOT trust signals.
6. Action Rules: Evaluate whether the primary next action is obvious: primary CTA clarity, prominence, wording, and relationship to the value proposition. Multiple CTAs are acceptable if the primary path is clear.
7. Visitor Thought: Represents a plausible, neutral first-time visitor interpretation scanning the homepage. NEVER sound like a testimonial, never claim the visitor used the product, never invent facts.
8. Five-Second Questions: Answer all 5 questions (what_is_this, who_is_it_for, what_will_i_get, why_should_i_care, what_should_i_do_next) using ONLY first-impression content. Allowed statuses: 'clear', 'understandable', 'partly_clear', 'unclear'.
9. Signal Independence: The 5 signal scores (First Impression, Audience, Value, Trust, Action) are strictly independent. High Value does NOT imply high Trust. Score 0-100 each.
10. Score & Risk Consistency: Scores, risks, and recommendations must tell a coherent, unified diagnostic story.
- If ANY signal score is below 70, you MUST include a corresponding risk in 'risks' detailing why first-time visitors hesitate or experience friction.
- Signal score < 50 MUST be flagged as 'high' severity risk (e.g. Trust < 50 => high severity trust risk; Audience < 50 => high severity audience risk).
- Signal score 50-69 MUST be flagged as 'medium' severity risk.
- NEVER return an empty 'risks' array if any signal score is below 70 or if the overall page needs improvement.
11. Priority Fix: Select the single highest-impact improvement targeting the weakest signal. Cite the exact current headline/text in 'what_you_say_now' (or 'current_direction') and supply a realistic, concrete rewrite in 'clearer_direction' (or 'suggested_direction') that maintains the product's authentic promise.
12. Other Improvements: Provide 2-3 distinct, actionable recommendations that do NOT duplicate the Priority Fix. Each must address a different aspect (e.g. trust, audience framing, CTA friction). Include title, explanation, 'why_it_matters' (visitor psychology), 'what_to_improve' (tactical advice), and 'copyable_suggestion' (a concrete, ready-to-use phrase tailored to this website).
13. Scope: The check evaluates the public homepage only ("Based on your homepage · First-time visitor perspective").

VERSION: ${ANALYSIS_VERSION}`;
