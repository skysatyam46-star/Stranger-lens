import { WebsiteSnapshot } from "@/lib/content-extractor";
import { EvidenceRef, WebsiteAnalysis } from "./analysisSchema";

/**
 * Collects all text fragments present anywhere in the WebsiteSnapshot into a searchable set.
 */
export function extractSearchableTextsFromSnapshot(snapshot: WebsiteSnapshot): string[] {
  const texts: string[] = [];

  // Meta
  if (snapshot.meta.title) texts.push(snapshot.meta.title);
  if (snapshot.meta.description) texts.push(snapshot.meta.description);

  // Navigation
  if (snapshot.navigation.brandName) texts.push(snapshot.navigation.brandName);
  if (snapshot.navigation.logoAlt) texts.push(snapshot.navigation.logoAlt);
  snapshot.navigation.primaryNavLinks.forEach((l) => texts.push(l.text));

  // Hero
  if (snapshot.hero.headline) texts.push(snapshot.hero.headline);
  if (snapshot.hero.subheadline) texts.push(snapshot.hero.subheadline);
  if (snapshot.hero.primaryCta) texts.push(snapshot.hero.primaryCta.text);
  if (snapshot.hero.secondaryCta) texts.push(snapshot.hero.secondaryCta.text);

  // CTAs
  snapshot.ctas.forEach((c) => texts.push(c.text));

  // ValueProps
  snapshot.valueProps.headings.forEach((h) => texts.push(h.text));
  snapshot.valueProps.featureCards.forEach((fc) => {
    texts.push(fc.title);
    if (fc.description) texts.push(fc.description);
  });
  snapshot.valueProps.pricingSignals.plans.forEach((p) => {
    if (p.name) texts.push(p.name);
    if (p.price) texts.push(p.price);
  });

  // TrustSignals
  snapshot.trustSignals.socialProofHeadings.forEach((sph) => texts.push(sph));
  snapshot.trustSignals.statsAndMetrics.forEach((stat) => texts.push(stat));
  snapshot.trustSignals.testimonials.forEach((t) => {
    texts.push(t.quote);
    if (t.author) texts.push(t.author);
    if (t.company) texts.push(t.company);
  });
  snapshot.trustSignals.badgesAndCertifications.forEach((b) => texts.push(b));
  snapshot.trustSignals.customerLogosAlt.forEach((c) => texts.push(c));

  // Body Sections
  snapshot.bodySections.forEach((s) => {
    if (s.heading) texts.push(s.heading);
    if (s.textSummary) texts.push(s.textSummary);
    s.bulletPoints.forEach((b) => texts.push(b));
  });

  // Forms
  snapshot.forms.forEach((f) => {
    if (f.submitLabel) texts.push(f.submitLabel);
    f.fields.forEach((fld) => {
      if (fld.label) texts.push(fld.label);
      if (fld.placeholder) texts.push(fld.placeholder);
    });
  });

  return texts;
}

/**
 * Checks if a given text fragment is grounded in any of the snapshot text fragments.
 */
export function isEvidenceGrounded(textToVerify: string, searchableTexts: string[]): boolean {
  if (!textToVerify || typeof textToVerify !== "string" || textToVerify.trim().length === 0) {
    return false;
  }

  const rawTarget = textToVerify.trim();
  const normalizedTarget = rawTarget.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalizedTarget.length < 2) return false;

  // 1. Exact or normalized whitespace match inside a snapshot text
  for (const src of searchableTexts) {
    if (!src) continue;
    if (src.includes(rawTarget)) return true;
    const normalizedSrc = src.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalizedSrc && normalizedSrc.includes(normalizedTarget)) {
      return true;
    }
  }

  // Reject AI meta-commentary paraphrases that are not direct substrings of the snapshot
  const diagnosticParaphrasePattern =
    /\b(your homepage|the homepage|your website|the website|claims to|fails to|does not state|does not clearly|currently lacks|visitors see|without explaining|without stating)\b/i;
  if (diagnosticParaphrasePattern.test(rawTarget)) {
    return false;
  }

  const stripPunct = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const normTarget = stripPunct(rawTarget);
  if (normTarget.length < 2) return false;

  const targetDigits: string[] = rawTarget.match(/\d+(?:\.\d+)?/g) || [];

  for (const src of searchableTexts) {
    const normSrc = stripPunct(src);
    if (!normSrc) continue;

    const isDirectSubstring = normSrc.includes(normTarget);
    const isSubstantialCover =
      normSrc.length >= 25 &&
      normTarget.includes(normSrc) &&
      normSrc.length >= Math.ceil(normTarget.length * 0.8);

    if (isDirectSubstring || isSubstantialCover) {
      const srcDigits: string[] = src.match(/\d+(?:\.\d+)?/g) || [];
      const hasAddedDigit = targetDigits.some((d) => !srcDigits.includes(d));
      if (hasAddedDigit) {
        return false;
      }
      return true;
    }
  }

  return false;
}

/**
 * Validates and cleans evidence_refs across the entire WebsiteAnalysis object against the WebsiteSnapshot.
 * Filters out hallucinated or ungrounded quotes.
 */
export function validateAndCleanEvidence(
  analysis: WebsiteAnalysis,
  snapshot: WebsiteSnapshot
): WebsiteAnalysis {
  const searchableTexts = extractSearchableTextsFromSnapshot(snapshot);

  const cleanRefs = (refs: EvidenceRef[] | undefined): EvidenceRef[] => {
    if (!Array.isArray(refs)) return [];
    return refs.filter((ref) => isEvidenceGrounded(ref.text, searchableTexts));
  };

  const cleaned: WebsiteAnalysis = JSON.parse(JSON.stringify(analysis));

  // First seconds
  cleaned.first_seconds.what_is_this.evidence_refs = cleanRefs(cleaned.first_seconds.what_is_this.evidence_refs);
  cleaned.first_seconds.who_is_it_for.evidence_refs = cleanRefs(cleaned.first_seconds.who_is_it_for.evidence_refs);
  cleaned.first_seconds.what_will_i_get.evidence_refs = cleanRefs(cleaned.first_seconds.what_will_i_get.evidence_refs);
  cleaned.first_seconds.why_should_i_care.evidence_refs = cleanRefs(cleaned.first_seconds.why_should_i_care.evidence_refs);
  cleaned.first_seconds.what_should_i_do_next.evidence_refs = cleanRefs(cleaned.first_seconds.what_should_i_do_next.evidence_refs);

  // Website message
  if (cleaned.website_message) {
    cleaned.website_message.evidence_refs = cleanRefs(cleaned.website_message.evidence_refs);
  }

  // Signals
  cleaned.signals.first_impression.evidence_refs = cleanRefs(cleaned.signals.first_impression.evidence_refs);
  cleaned.signals.audience.evidence_refs = cleanRefs(cleaned.signals.audience.evidence_refs);
  cleaned.signals.value.evidence_refs = cleanRefs(cleaned.signals.value.evidence_refs);
  cleaned.signals.trust.evidence_refs = cleanRefs(cleaned.signals.trust.evidence_refs);
  cleaned.signals.action.evidence_refs = cleanRefs(cleaned.signals.action.evidence_refs);

  // Risks
  if (Array.isArray(cleaned.risks)) {
    cleaned.risks.forEach((risk) => {
      risk.evidence_refs = cleanRefs(risk.evidence_refs);
    });
  }

  // Priority fix
  cleaned.priority_fix.evidence_refs = cleanRefs(cleaned.priority_fix.evidence_refs);

  // Other improvements
  if (Array.isArray(cleaned.other_improvements)) {
    cleaned.other_improvements.forEach((imp) => {
      imp.evidence_refs = cleanRefs(imp.evidence_refs);
    });
  }

  return cleaned;
}
