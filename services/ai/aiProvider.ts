import { GoogleGenAI } from "@google/genai";
import { WebsiteSnapshot } from "@/lib/content-extractor";
import { WebsiteAnalysis, WEBSITE_ANALYSIS_GEMINI_SCHEMA } from "./analysisSchema";
import { formatSnapshotForAi, SYSTEM_PROMPT, ANALYSIS_VERSION } from "./analysisPrompt";

export interface AIProvider {
  analyzeWebsite(snapshot: WebsiteSnapshot): Promise<WebsiteAnalysis>;
}

export class GeminiAIProvider implements AIProvider {
  private ai: GoogleGenAI | null = null;
  private candidateModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"];

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (key) {
      this.ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }

  async analyzeWebsite(snapshot: WebsiteSnapshot): Promise<WebsiteAnalysis> {
    if (!this.ai) {
      throw new Error("AI service unconfigured: GEMINI_API_KEY environment variable is missing on server");
    }

    const formattedInput = formatSnapshotForAi(snapshot);
    const userPrompt = `Perform a Percept first-impression analysis on this WebsiteSnapshot:\n\n${formattedInput}`;

    let lastError: Error | null = null;

    for (const model of this.candidateModels) {
      try {
        const response = await this.ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: WEBSITE_ANALYSIS_GEMINI_SCHEMA,
            temperature: 0.2, // Low temperature for deterministic analysis
          },
        });

        const rawText = response.text;
        if (!rawText) {
          throw new Error("Empty response returned from AI analysis engine");
        }

        const parsed = JSON.parse(rawText) as WebsiteAnalysis;

        // Verify required top-level fields
        if (
          parsed.analysis_version === "1.0" &&
          parsed.verdict &&
          parsed.first_seconds &&
          parsed.signals
        ) {
          return parsed;
        } else {
          throw new Error("AI response structure missing required schema properties");
        }
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Gemini AI analysis with model ${model} failed:`, lastError.message);
      }
    }

    throw new Error(`AI website analysis failed: ${lastError?.message || "Engine timeout or invalid response"}`);
  }
}
