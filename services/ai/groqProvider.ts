import { WebsiteSnapshot } from "@/lib/content-extractor";
import { WebsiteAnalysis } from "./analysisSchema";
import { formatSnapshotForAi, SYSTEM_PROMPT } from "./analysisPrompt";

export interface AIProvider {
  analyzeWebsite(snapshot: WebsiteSnapshot): Promise<WebsiteAnalysis>;
}

/**
 * Standard system and JSON schema instructions for Groq LLMs.
 */
const JSON_INSTRUCTION = `
You must respond with ONLY a valid, parseable JSON object matching the required schema.
Do NOT include markdown formatting (like \`\`\`json or \`\`\`), greetings, apologies, or commentary.
Output ONLY the raw JSON object.`;

export class GroqAIProvider implements AIProvider {
  private apiKey: string | undefined;
  // Primary model requested by user: openai/gpt-oss-20b, with fallbacks: openai/gpt-oss-120b, qwen/qwen3.8-27b, llama-3.3-70b-versatile
  private primaryModel = "openai/gpt-oss-20b";
  private fallbackModels = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GROQ_API_KEY;
  }

  async analyzeWebsite(snapshot: WebsiteSnapshot): Promise<WebsiteAnalysis> {
    if (!this.apiKey || !this.apiKey.trim()) {
      // Server log without exposing any sensitive details
      console.error("Groq API key is not configured.");
      const err = new Error("Analysis is temporarily unavailable. Please try again later.");
      (err as any).code = "AI_PROVIDER_NOT_CONFIGURED";
      throw err;
    }

    const formattedInput = formatSnapshotForAi(snapshot);
    const userPrompt = `Perform a Percept first-impression analysis on this WebsiteSnapshot:

${formattedInput}

Output a strictly valid JSON object matching this schema:
{
  "analysis_version": "1.0",
  "verdict": {
    "status": "clear" | "needs_improvement",
    "text": "string summary"
  },
  "first_seconds": {
    "what_is_this": {
      "status": "clear" | "understandable" | "partly_clear" | "unclear",
      "explanation": "string",
      "evidence_refs": [{"source": "hero", "element": "h1", "text": "verbatim quote from snapshot", "relevance": "strong"}]
    },
    "who_is_it_for": {
      "status": "clear" | "understandable" | "partly_clear" | "unclear",
      "explanation": "string",
      "evidence_refs": [...]
    },
    "what_will_i_get": {
      "status": "clear" | "understandable" | "partly_clear" | "unclear",
      "explanation": "string",
      "evidence_refs": [...]
    },
    "why_should_i_care": {
      "status": "clear" | "understandable" | "partly_clear" | "unclear",
      "explanation": "string",
      "evidence_refs": [...]
    },
    "what_should_i_do_next": {
      "status": "clear" | "understandable" | "partly_clear" | "unclear",
      "explanation": "string",
      "evidence_refs": [...]
    }
  },
  "visitor_thought": {
    "text": "string (stranger's first-person impression, e.g. 'A first-time visitor would likely wonder...')",
    "confidence": "high" | "medium" | "low"
  },
  "signals": {
    "first_impression": {
      "score": number (0-100),
      "status": "clear" | "understandable" | "partly_clear" | "unclear" | "needs_work" | "could_be_stronger",
      "explanation": "string",
      "confidence": "high" | "medium" | "low",
      "evidence_refs": [...]
    },
    "audience": {
      "score": number (0-100),
      "status": "...",
      "explanation": "string",
      "confidence": "high" | "medium" | "low",
      "evidence_refs": [...]
    },
    "value": {
      "score": number (0-100),
      "status": "...",
      "explanation": "string",
      "confidence": "high" | "medium" | "low",
      "evidence_refs": [...]
    },
    "trust": {
      "score": number (0-100),
      "status": "...",
      "explanation": "string",
      "confidence": "high" | "medium" | "low",
      "evidence_refs": [...]
    },
    "action": {
      "score": number (0-100),
      "status": "...",
      "explanation": "string",
      "confidence": "high" | "medium" | "low",
      "evidence_refs": [...]
    }
  },
  "risks": [
    {
      "category": "trust" | "audience" | "value" | "action" | "clarity",
      "severity": "high" | "medium" | "low",
      "title": "string",
      "description": "string",
      "why_it_matters": "string",
      "evidence_refs": [...]
    }
  ],
  "priority_fix": {
    "title": "string",
    "reason": "string",
    "impact": "high" | "medium",
    "what_you_say_now": "string (exact quote from hero)",
    "clearer_direction": "string (concrete suggested rewrite)",
    "current_direction": "string",
    "suggested_direction": "string",
    "evidence_refs": [...]
  },
  "other_improvements": [
    {
      "title": "string",
      "explanation": "string",
      "why_it_matters": "string",
      "what_to_improve": "string",
      "copyable_suggestion": "string",
      "evidence_refs": [...]
    }
  ]
}`;

    const modelsToTry = [this.primaryModel, ...this.fallbackModels];
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        const result = await this.callGroqChatApi(model, userPrompt);
        if (result) {
          return result;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Groq model ${model} execution error:`, lastError.message);
        if ((err as any)?.code === "AI_PROVIDER_AUTH_ERROR") {
          throw err;
        }
      }
    }

    throw new Error(
      `AI website analysis failed: ${lastError?.message || "Engine timeout or invalid response"}`
    );
  }

  private async callGroqChatApi(
    model: string,
    userPrompt: string
  ): Promise<WebsiteAnalysis> {
    const endpoint = "https://api.groq.com/openai/v1/chat/completions";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `${SYSTEM_PROMPT}\n${JSON_INSTRUCTION}`,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_completion_tokens: 3000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody = "";
        try {
          const errJson = await response.json();
          errorBody = errJson?.error?.message || JSON.stringify(errJson);
        } catch {
          errorBody = await response.text().catch(() => "");
        }

        if (
          response.status === 401 ||
          response.status === 403 ||
          errorBody.includes("blocked at the project level") ||
          errorBody.includes("model_permission_blocked_project")
        ) {
          console.warn("Groq models blocked at project level or unauthenticated. Fast fallback to Gemini.");
          const authErr = new Error("Groq models blocked at project level");
          (authErr as any).code = "AI_PROVIDER_AUTH_ERROR";
          throw authErr;
        }

        throw new Error(`Groq API returned HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content || typeof content !== "string") {
        throw new Error("Empty response content returned from Groq API");
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (jsonErr) {
        // Strip markdown backticks if present
        const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        parsed = JSON.parse(cleaned);
      }

      return this.validateAndNormalizeGroqPayload(parsed);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private validateAndNormalizeGroqPayload(parsed: any): WebsiteAnalysis {
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid response format: expected JSON object");
    }

    // Ensure analysis_version
    parsed.analysis_version = "1.0";

    // Ensure verdict
    if (!parsed.verdict || typeof parsed.verdict !== "object") {
      parsed.verdict = {
        status: "needs_improvement",
        text: "Website requires clearer headline communication and visible audience framing.",
      };
    } else {
      parsed.verdict.status =
        parsed.verdict.status === "clear" ? "clear" : "needs_improvement";
      parsed.verdict.text =
        typeof parsed.verdict.text === "string" && parsed.verdict.text.trim()
          ? parsed.verdict.text
          : "Website core benefit messaging can be strengthened.";
    }

    // Ensure first_seconds
    const defaultFsItem = () => ({
      status: "partly_clear" as const,
      explanation: "Diagnostic evaluation from above the fold content.",
      evidence_refs: [],
    });

    if (!parsed.first_seconds || typeof parsed.first_seconds !== "object") {
      parsed.first_seconds = {};
    }

    const fsKeys = [
      "what_is_this",
      "who_is_it_for",
      "what_will_i_get",
      "why_should_i_care",
      "what_should_i_do_next",
    ] as const;

    for (const key of fsKeys) {
      if (!parsed.first_seconds[key] || typeof parsed.first_seconds[key] !== "object") {
        parsed.first_seconds[key] = defaultFsItem();
      } else {
        const item = parsed.first_seconds[key];
        const validStatuses = ["clear", "understandable", "partly_clear", "unclear"];
        if (!validStatuses.includes(item.status)) {
          item.status = "partly_clear";
        }
        if (!Array.isArray(item.evidence_refs)) {
          item.evidence_refs = [];
        }
      }
    }

    // Ensure visitor_thought
    if (!parsed.visitor_thought || typeof parsed.visitor_thought !== "object") {
      parsed.visitor_thought = {
        text: "A first-time visitor can see the general topic, but wants immediate clarity on specific outcomes.",
        confidence: "medium",
      };
    } else {
      if (typeof parsed.visitor_thought.text !== "string" || !parsed.visitor_thought.text.trim()) {
        parsed.visitor_thought.text =
          "A first-time visitor quickly evaluates whether this tool directly solves their urgent problem.";
      }
      if (!["high", "medium", "low"].includes(parsed.visitor_thought.confidence)) {
        parsed.visitor_thought.confidence = "medium";
      }
    }

    // Ensure signals
    const defaultSignalItem = (defStatus: string, defScore: number) => ({
      score: defScore,
      status: defStatus,
      explanation: "Diagnostic signal evaluation.",
      confidence: "medium" as const,
      evidence_refs: [],
    });

    if (!parsed.signals || typeof parsed.signals !== "object") {
      parsed.signals = {};
    }

    const signalDefs: Record<string, { status: string; score: number }> = {
      first_impression: { status: "clear", score: 70 },
      audience: { status: "understandable", score: 65 },
      value: { status: "understandable", score: 65 },
      trust: { status: "could_be_stronger", score: 55 },
      action: { status: "clear", score: 75 },
    };

    for (const [sKey, def] of Object.entries(signalDefs)) {
      if (!parsed.signals[sKey] || typeof parsed.signals[sKey] !== "object") {
        parsed.signals[sKey] = defaultSignalItem(def.status, def.score);
      } else {
        const sig = parsed.signals[sKey];
        if (typeof sig.score !== "number" || isNaN(sig.score)) {
          sig.score = def.score;
        } else {
          sig.score = Math.max(0, Math.min(100, Math.round(sig.score)));
        }
        if (!sig.status || typeof sig.status !== "string") {
          sig.status = def.status;
        }
        if (!["high", "medium", "low"].includes(sig.confidence)) {
          sig.confidence = "medium";
        }
        if (!Array.isArray(sig.evidence_refs)) {
          sig.evidence_refs = [];
        }
      }
    }

    // Ensure risks
    if (!Array.isArray(parsed.risks)) {
      parsed.risks = [];
    } else {
      parsed.risks = parsed.risks.map((r: any) => ({
        category: typeof r?.category === "string" ? r.category : "clarity",
        severity: ["high", "medium", "low"].includes(r?.severity) ? r.severity : "medium",
        title: typeof r?.title === "string" ? r.title : "Communication friction identified",
        description: typeof r?.description === "string" ? r.description : "First-time visitors may experience friction understanding this element.",
        why_it_matters: typeof r?.why_it_matters === "string" ? r.why_it_matters : "Clear messaging reduces visitor drop-off.",
        evidence_refs: Array.isArray(r?.evidence_refs) ? r.evidence_refs : [],
      }));
    }

    // Ensure priority_fix
    if (!parsed.priority_fix || typeof parsed.priority_fix !== "object") {
      parsed.priority_fix = {
        title: "Clarify the target audience and core benefit in the hero section",
        reason: "First-time visitors decide whether to stay within 5 seconds based on relevance.",
        impact: "high",
        what_you_say_now: "Broad or conceptual headline statement",
        clearer_direction: "Direct outcome statement stating who it is for and what problem it solves",
        current_direction: "Broad or conceptual headline statement",
        suggested_direction: "Direct outcome statement stating who it is for and what problem it solves",
        evidence_refs: [],
      };
    } else {
      if (!Array.isArray(parsed.priority_fix.evidence_refs)) {
        parsed.priority_fix.evidence_refs = [];
      }
    }

    // Ensure other_improvements
    if (!Array.isArray(parsed.other_improvements)) {
      parsed.other_improvements = [];
    } else {
      parsed.other_improvements = parsed.other_improvements.map((imp: any) => ({
        title: imp?.title || "Strengthen proof points",
        explanation: imp?.explanation || "Include verifiable metrics and testimonials above the fold.",
        why_it_matters: imp?.why_it_matters || undefined,
        what_to_improve: imp?.what_to_improve || undefined,
        copyable_suggestion: imp?.copyable_suggestion || undefined,
        evidence_refs: Array.isArray(imp?.evidence_refs) ? imp.evidence_refs : [],
      }));
    }

    return parsed as WebsiteAnalysis;
  }
}
