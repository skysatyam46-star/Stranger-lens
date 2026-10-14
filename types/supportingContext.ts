export type SupportingContextStatus = "available" | "partial" | "unavailable";

export type EvidenceClaimBasis =
  | "directly_observed_element"
  | "website_published_claim";

export interface SourceEvidence {
  sourceUrl: string;
  excerpt: string;
  interpretation?: string;
  claimBasis?: EvidenceClaimBasis;
}

export interface SupportingPageAnalyzedSummary {
  url: string;
  category: string;
  title?: string;
}

export interface SupportingContextSection {
  status?:
    | "consistent"
    | "clarifies_homepage"
    | "divergent"
    | "observed"
    | "insufficient_evidence"
    | "unavailable";
  assessment: string;
  evidence: SourceEvidence[];
}

export interface SupportingCtaDestinationContext {
  ctaText?: string;
  destinationUrl?: string;
  inspectable: boolean;
  purposeClear?: boolean;
  alignsWithCtaWording?: boolean;
  nextActionUnderstandable?: boolean;
  assessment: string;
  evidence: SourceEvidence[];
}

export interface SupportingContext {
  status: SupportingContextStatus;
  pagesAnalyzed: SupportingPageAnalyzedSummary[];
  messageConsistency?: SupportingContextSection;
  trustContext?: SupportingContextSection;
  ctaDestination?: SupportingCtaDestinationContext;
  limitations: string[];
}

export interface RawSupportingContextAIOutput {
  messageConsistency?: {
    status?:
      | "consistent"
      | "clarifies_homepage"
      | "divergent"
      | "insufficient_evidence";
    assessment?: string;
    evidence?: Array<{
      sourceUrl?: string;
      excerpt?: string;
      interpretation?: string;
    }>;
  };
  trustContext?: {
    status?: "observed" | "insufficient_evidence";
    assessment?: string;
    evidence?: Array<{
      sourceUrl?: string;
      excerpt?: string;
      interpretation?: string;
      claimBasis?: EvidenceClaimBasis;
    }>;
  };
  ctaDestination?: {
    purposeClear?: boolean;
    alignsWithCtaWording?: boolean;
    nextActionUnderstandable?: boolean;
    assessment?: string;
    evidence?: Array<{
      sourceUrl?: string;
      excerpt?: string;
      interpretation?: string;
    }>;
  };
}
