import { WebsiteSnapshot } from "@/lib/content-extractor";
import { WebsiteAnalysis } from "./analysisSchema";
import { GroqAIProvider } from "./groqProvider";
import { GeminiAIProvider } from "./aiProvider";
import { validateAndCleanEvidence } from "./evidenceValidator";

export interface AnalyzeWebsiteOptions {
  apiKey?: string;
}

/**
 * Main entry point for Phase 3 AI Analysis.
 * Analyzes a Phase 2 WebsiteSnapshot using Groq API as the primary AI provider,
 * with seamless fallback to Gemini AI Provider if Groq encounters project-level
 * model restrictions or downtime, ensuring continuous real analysis availability.
 * Verifies structured output, cleans and validates evidence references
 * against original snapshot text, and returns a grounded WebsiteAnalysis.
 */
export async function analyzeWebsite(
  snapshot: WebsiteSnapshot,
  options: AnalyzeWebsiteOptions = {}
): Promise<WebsiteAnalysis> {
  let rawAnalysis: WebsiteAnalysis | null = null;
  let groqError: Error | null = null;

  // 1. Try Groq AI Provider first (using openai/gpt-oss-20b)
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
    try {
      const groqProvider = new GroqAIProvider(options.apiKey);
      rawAnalysis = await groqProvider.analyzeWebsite(snapshot);
    } catch (err: unknown) {
      groqError = err instanceof Error ? err : new Error(String(err));
      console.warn("Groq AI analysis encountered an error, falling back to Gemini provider:", groqError.message);
    }
  }

  // 2. If Groq was not configured or threw an error, use Gemini AI Provider
  if (!rawAnalysis) {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      try {
        const geminiProvider = new GeminiAIProvider();
        rawAnalysis = await geminiProvider.analyzeWebsite(snapshot);
      } catch (geminiErr: unknown) {
        console.error("Gemini AI analysis error:", geminiErr);
        throw geminiErr;
      }
    } else if (groqError) {
      throw groqError;
    } else {
      const err = new Error("Analysis is temporarily unavailable. Please try again later.");
      (err as any).code = "AI_PROVIDER_NOT_CONFIGURED";
      throw err;
    }
  }

  // 3. Validate and Clean Evidence References against original WebsiteSnapshot
  const groundedAnalysis = validateAndCleanEvidence(rawAnalysis, snapshot);

  return groundedAnalysis;
}

