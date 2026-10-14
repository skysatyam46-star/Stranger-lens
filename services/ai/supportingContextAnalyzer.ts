import { GoogleGenAI, Type, Schema } from "@google/genai";
import { WebsiteSnapshot } from "@/lib/content-extractor";
import {
  discoverAndFetchSupportingPages,
  FetchSupportingPagesOptions,
  SupportingPageRecord,
  SupportingPagesBundle,
} from "@/lib/supporting-page-fetcher";
import {
  isSupportingPagesEnabled,
  SERVER_LIMITS,
} from "@/server/config/limits";
import {
  RawSupportingContextAIOutput,
  SupportingContext,
} from "@/types/supportingContext";
import { validateAndBuildSupportingContext } from "@/services/validation/supportingContextValidator";

export interface SupportingContextAnalysisOptions {
  /** Explicit feature flag override (defaults to `isSupportingPagesEnabled()` which is `false` unless enabled) */
  enabled?: boolean;
  /** Optional pre-fetched supporting pages bundle */
  supportingPagesBundle?: SupportingPagesBundle;
  /** Optional custom page fetcher for deterministic unit tests */
  fetcher?: FetchSupportingPagesOptions["fetcher"];
  /** Optional custom AI runner for deterministic unit tests (avoids live paid AI calls) */
  aiRunner?: (
    promptPayload: string,
    pages: SupportingPageRecord[]
  ) => Promise<RawSupportingContextAIOutput>;
  /** Optional abort signal from request pipeline */
  signal?: AbortSignal;
  /** Optional timeout override for the single supporting-context AI call */
  aiTimeoutMs?: number;
}

const SUPPORTING_CONTEXT_SYSTEM_PROMPT = `You are StrangerLens's Supporting-Page Context Analyzer.

Your role is to evaluate how up to 3 same-domain supporting pages relate to the website's homepage message.
You do NOT score the homepage. You only produce structured supporting-page context across three dimensions:
1. messageConsistency: Whether the supporting pages clarify, reinforce, or diverge from the homepage's central product promise. Do NOT claim inconsistency merely because supporting pages have more detail.
2. trustContext: Relevant credibility elements observed on supporting pages (such as company background, methodology explanations, published customer testimonials, documentation, or security statements).
   CRITICAL RULE: Every testimonial, metric, badge, partnership, or award on a website is a WEBSITE-PUBLISHED CLAIM, NOT an independently verified fact. Always state that credibility claims are published on the website and not independently verified.
3. ctaDestination: If the homepage's primary CTA points to one of the fetched supporting pages, evaluate whether that page's purpose is clear, aligns with the CTA wording, and offers an understandable next action.

STRICT EVIDENCE RULES:
- Every item in 'evidence' MUST cite the exact 'sourceUrl' of the supporting page where the quote appears.
- Every 'excerpt' MUST be an EXACT, VERBATIM substring copied from that specific supporting page's extracted data.
- NEVER invent quotes, NEVER attribute homepage quotes to a supporting page, and NEVER attribute one supporting page's text to another supporting page.`;

const SUPPORTING_CONTEXT_GEMINI_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    messageConsistency: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          enum: [
            "consistent",
            "clarifies_homepage",
            "divergent",
            "insufficient_evidence",
          ],
        },
        assessment: { type: Type.STRING },
        evidence: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sourceUrl: { type: Type.STRING },
              excerpt: { type: Type.STRING },
              interpretation: { type: Type.STRING },
            },
            required: ["sourceUrl", "excerpt"],
          },
        },
      },
      required: ["status", "assessment", "evidence"],
    },
    trustContext: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          enum: ["observed", "insufficient_evidence"],
        },
        assessment: { type: Type.STRING },
        evidence: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sourceUrl: { type: Type.STRING },
              excerpt: { type: Type.STRING },
              interpretation: { type: Type.STRING },
            },
            required: ["sourceUrl", "excerpt"],
          },
        },
      },
      required: ["status", "assessment", "evidence"],
    },
    ctaDestination: {
      type: Type.OBJECT,
      properties: {
        purposeClear: { type: Type.BOOLEAN },
        alignsWithCtaWording: { type: Type.BOOLEAN },
        nextActionUnderstandable: { type: Type.BOOLEAN },
        assessment: { type: Type.STRING },
        evidence: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sourceUrl: { type: Type.STRING },
              excerpt: { type: Type.STRING },
              interpretation: { type: Type.STRING },
            },
            required: ["sourceUrl", "excerpt"],
          },
        },
      },
      required: [
        "purposeClear",
        "alignsWithCtaWording",
        "nextActionUnderstandable",
        "assessment",
        "evidence",
      ],
    },
  },
  required: ["messageConsistency", "trustContext"],
};

/**
 * Formats the homepage core promise and up to 3 supporting page snapshots into a
 * tightly bounded JSON payload capped by `SERVER_LIMITS.SUPPORTING_CONTEXT_MAX_INPUT_CHARS`.
 */
export function formatSupportingContextPromptPayload(
  homepageSnapshot: WebsiteSnapshot,
  homepageFinalUrl: string,
  pages: SupportingPageRecord[]
): string {
  const payload = {
    homepage: {
      url: homepageFinalUrl,
      title: homepageSnapshot.meta.title.slice(0, 180),
      headline: homepageSnapshot.hero.headline.slice(0, 240),
      subheadline: homepageSnapshot.hero.subheadline.slice(0, 300),
      primaryCta: homepageSnapshot.hero.primaryCta
        ? {
            text: homepageSnapshot.hero.primaryCta.text.slice(0, 80),
            href: homepageSnapshot.hero.primaryCta.href?.slice(0, 180),
          }
        : undefined,
    },
    supportingPages: pages
      .slice(0, SERVER_LIMITS.SUPPORTING_PAGES_MAX_COUNT)
      .map((p) => ({
        sourceUrl: p.finalUrl,
        category: p.pageType,
        title: p.snapshot.meta.title.slice(0, 160),
        headline: p.snapshot.hero.headline.slice(0, 220),
        subheadline: p.snapshot.hero.subheadline.slice(0, 260),
        primaryCta: p.snapshot.hero.primaryCta?.text.slice(0, 80),
        headings: p.snapshot.valueProps.headings
          .slice(0, 5)
          .map((h) => h.text.slice(0, 140)),
        featureCards: p.snapshot.valueProps.featureCards
          .slice(0, 4)
          .map((fc) => ({
            title: fc.title.slice(0, 100),
            description: fc.description.slice(0, 180),
          })),
        pricingPlans: p.snapshot.valueProps.pricingSignals.plans
          .slice(0, 3)
          .map((pl) => ({
            name: pl.name?.slice(0, 60),
            price: pl.price?.slice(0, 60),
          })),
        trustElements: {
          socialProofHeadings: p.snapshot.trustSignals.socialProofHeadings
            .slice(0, 3)
            .map((s) => s.slice(0, 140)),
          statsAndMetrics: p.snapshot.trustSignals.statsAndMetrics
            .slice(0, 4)
            .map((s) => s.slice(0, 80)),
          testimonials: p.snapshot.trustSignals.testimonials
            .slice(0, 2)
            .map((t) => ({
              quote: t.quote.slice(0, 200),
              author: t.author?.slice(0, 60),
            })),
          badges: p.snapshot.trustSignals.badgesAndCertifications.slice(0, 5),
        },
        sectionSummaries: p.snapshot.bodySections
          .slice(0, 3)
          .map((s) => s.textSummary.slice(0, 200)),
      })),
  };

  const serialized = JSON.stringify(payload);
  const maxChars = SERVER_LIMITS.SUPPORTING_CONTEXT_MAX_INPUT_CHARS;
  return serialized.length > maxChars
    ? serialized.slice(0, maxChars)
    : serialized;
}

/**
 * Executes at most ONE combined AI request for supporting-page context using the existing
 * Groq primary -> Gemini fallback provider order and strict timeout enforcement.
 */
async function callDefaultSupportingContextAI(
  promptPayload: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<RawSupportingContextAIOutput> {
  const timeoutMs =
    options.timeoutMs ?? SERVER_LIMITS.SUPPORTING_CONTEXT_AI_TIMEOUT_MS;

  const userPrompt = `Analyze the following homepage summary and fetched supporting pages. Return ONLY valid JSON with messageConsistency, trustContext, and ctaDestination, citing exact verbatim excerpts and exact sourceUrl values from supportingPages:\n\n${promptPayload}`;

  // 1. Try Groq first if configured (preserving existing provider order & model selection)
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const groqModels = [
      "openai/gpt-oss-20b",
      "openai/gpt-oss-120b",
      "llama-3.3-70b-versatile",
    ];
    for (const model of groqModels) {
      if (options.signal?.aborted) {
        throw new Error("Supporting-context AI aborted by deadline");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const parentAbort = () => controller.abort();
      options.signal?.addEventListener("abort", parentAbort, { once: true });

      try {
        const res = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: `${SUPPORTING_CONTEXT_SYSTEM_PROMPT}\nRespond with ONLY a valid JSON object.`,
                },
                {
                  role: "user",
                  content: userPrompt,
                },
              ],
              response_format: { type: "json_object" },
              temperature: 0.1,
              max_completion_tokens: 1200,
            }),
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          if (
            res.status === 401 ||
            res.status === 403 ||
            errText.includes("blocked at the project level") ||
            errText.includes("model_permission_blocked_project")
          ) {
            break; // Fast fallback to Gemini
          }
          continue;
        }

        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim()) {
          const cleaned = content
            .replace(/^```json\s*/i, "")
            .replace(/```$/i, "")
            .trim();
          return JSON.parse(cleaned) as RawSupportingContextAIOutput;
        }
      } catch {
        // Continue to next fallback
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", parentAbort);
      }
    }
  }

  // 2. Fallback to Gemini if configured
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    const candidateModels = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
    ];

    for (const model of candidateModels) {
      if (options.signal?.aborted) {
        throw new Error("Supporting-context AI aborted by deadline");
      }
      try {
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: SUPPORTING_CONTEXT_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: SUPPORTING_CONTEXT_GEMINI_SCHEMA,
            temperature: 0.1,
          },
        });

        if (response.text) {
          return JSON.parse(response.text) as RawSupportingContextAIOutput;
        }
      } catch {
        // Try next candidate model
      }
    }
  }

  throw new Error("Supporting-context AI synthesis unavailable");
}

/**
 * Safe, isolated Phase 2 Supporting-Page Context pipeline.
 *
 * - Returns `undefined` immediately without fetching or calling AI if the feature flag is disabled (default OFF).
 * - When enabled, discovers and safely fetches up to 3 supporting pages (or uses a provided bundle).
 * - If 0 pages are fetched, returns a validated `SupportingContext` with `status: "unavailable"` and makes 0 AI calls.
 * - If 1-3 pages are fetched, makes at most ONE bounded AI call, validates every quote & URL deterministically,
 *   and degrades gracefully to deterministic snapshot observations if the AI call fails.
 * - Never throws; never alters homepage scores or homepage findings.
 */
export async function generateSupportingPageContext(
  homepageSnapshot: WebsiteSnapshot,
  homepageFinalUrl: string,
  homepageHtml: string,
  options: SupportingContextAnalysisOptions = {}
): Promise<{
  supportingContext?: SupportingContext;
  supportingPagesBundle?: SupportingPagesBundle;
}> {
  if (!isSupportingPagesEnabled(options.enabled)) {
    return {};
  }

  try {
    const bundle =
      options.supportingPagesBundle ??
      (await discoverAndFetchSupportingPages(homepageHtml, homepageFinalUrl, {
        fetcher: options.fetcher,
        signal: options.signal,
      }));

    // When no supporting pages were fetched, skip AI completely (0 additional AI calls)
    if (bundle.pages.length === 0) {
      const unavailableContext = validateAndBuildSupportingContext(
        homepageSnapshot,
        homepageFinalUrl,
        bundle,
        null
      );
      return {
        supportingContext: unavailableContext,
        supportingPagesBundle: bundle,
      };
    }

    const promptPayload = formatSupportingContextPromptPayload(
      homepageSnapshot,
      homepageFinalUrl,
      bundle.pages
    );

    let rawAiOutput: RawSupportingContextAIOutput | null = null;
    let aiErrorMessage: string | undefined;

    try {
      if (options.aiRunner) {
        rawAiOutput = await options.aiRunner(promptPayload, bundle.pages);
      } else {
        rawAiOutput = await callDefaultSupportingContextAI(promptPayload, {
          timeoutMs: options.aiTimeoutMs,
          signal: options.signal,
        });
      }
    } catch (aiErr: unknown) {
      aiErrorMessage =
        aiErr instanceof Error
          ? aiErr.message
          : "Supporting-context AI call failed";
    }

    const validatedContext = validateAndBuildSupportingContext(
      homepageSnapshot,
      homepageFinalUrl,
      bundle,
      rawAiOutput,
      { aiErrorMessage }
    );

    return {
      supportingContext: validatedContext,
      supportingPagesBundle: bundle,
    };
  } catch (err: unknown) {
    console.warn(
      "Supporting-page context pipeline encountered an error and degraded gracefully:",
      err instanceof Error ? err.message : "Unknown error"
    );
    return {
      supportingContext: {
        status: "unavailable",
        pagesAnalyzed: [],
        limitations: [
          "Supporting-page context analysis encountered an unexpected error and was skipped to preserve the homepage report.",
        ],
      },
    };
  }
}
