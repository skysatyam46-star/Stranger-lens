/**
 * Centralized Server-Side Resource Limits, Timeouts & Safety Configuration.
 *
 * All external operations (HTTP fetch, HTML parsing, snapshot compression, AI calls,
 * and total request pipeline) are bound by hard limits to protect against unbounded execution,
 * SSRF, giant payloads, memory leaks, runaway retries, and cost overruns.
 */

function getEnvNumber(key: string, defaultValue: number): number {
  if (typeof process === "undefined" || !process.env) return defaultValue;
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  if (typeof process === "undefined" || !process.env) return defaultValue;
  const val = process.env[key];
  if (!val || typeof val !== "string") return defaultValue;
  const normalized = val.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return defaultValue;
}

/**
 * Evaluates at runtime whether Multi-Page Supporting Context Analysis is enabled.
 * Defaults strictly to `false` (OFF). Only an explicit value of `"true"` (or `override === true`
 * in isolated test environments) enables the feature; any missing, empty, or invalid value leaves it disabled.
 */
export function isSupportingPagesEnabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  if (typeof process === "undefined" || !process.env) return false;
  const raw = process.env.ENABLE_SUPPORTING_PAGES_ANALYSIS;
  if (typeof raw !== "string") return false;
  return raw.trim().toLowerCase() === "true";
}

export const SERVER_LIMITS = {
  /** Maximum time allowed for initial website HTTP fetch (default 10s) */
  WEBSITE_FETCH_TIMEOUT_MS: getEnvNumber("WEBSITE_FETCH_TIMEOUT_MS", 10000),

  /** Maximum response body size streamed/downloaded from target website (default 5MB) */
  WEBSITE_MAX_RESPONSE_BYTES: getEnvNumber("WEBSITE_MAX_RESPONSE_BYTES", 5000000),

  /** Maximum number of HTTP redirects followed before failing (default 5) */
  WEBSITE_MAX_REDIRECTS: getEnvNumber("WEBSITE_MAX_REDIRECTS", 5),

  /** Maximum characters of HTML passed to Cheerio DOM content extraction (default 200,000) */
  WEBSITE_MAX_HTML_CHARS: getEnvNumber("WEBSITE_MAX_HTML_CHARS", 200000),

  /** Maximum execution lifetime if browser fallback is active (default 20s) */
  PLAYWRIGHT_TIMEOUT_MS: getEnvNumber("PLAYWRIGHT_TIMEOUT_MS", 20000),

  /** Maximum payload size in browser fallback (default 5MB) */
  PLAYWRIGHT_MAX_PAGE_SIZE_BYTES: getEnvNumber("PLAYWRIGHT_MAX_PAGE_SIZE_BYTES", 5000000),

  /** Timeout per individual AI model completion request (default 30s) */
  AI_TIMEOUT_MS: getEnvNumber("AI_TIMEOUT_MS", 30000),

  /** Maximum retry attempts for transient AI errors (429, 500, 502, 503, 504, timeout) (default 2 retries, 3 total attempts) */
  AI_MAX_RETRIES: getEnvNumber("AI_MAX_RETRIES", 2),

  /** Maximum token budget estimated for AI input payload (~4 chars per token, ~32,000 chars) */
  AI_MAX_INPUT_TOKENS: getEnvNumber("AI_MAX_INPUT_TOKENS", 8000),

  /** Maximum token limit requested for AI structured output response (default 3,000) */
  AI_MAX_OUTPUT_TOKENS: getEnvNumber("AI_MAX_OUTPUT_TOKENS", 3000),

  /** Global deadline for the entire website check lifecycle (default 90s) */
  ANALYSIS_TOTAL_TIMEOUT_MS: getEnvNumber("ANALYSIS_TOTAL_TIMEOUT_MS", 90000),

  /** Maximum number of check requests permitted per client IP per minute (default 15) */
  CHECK_RATE_LIMIT_PER_MINUTE: getEnvNumber("CHECK_RATE_LIMIT_PER_MINUTE", 15),

  /** Maximum concurrent analysis jobs permitted per client IP (default 2) */
  CHECK_MAX_CONCURRENT_PER_IP: getEnvNumber("CHECK_MAX_CONCURRENT_PER_IP", 2),

  /** Maximum number of pre-scan verify requests permitted per client IP per minute (default 30) */
  VERIFY_RATE_LIMIT_PER_MINUTE: getEnvNumber("VERIFY_RATE_LIMIT_PER_MINUTE", 30),

  /** Maximum concurrent verify requests permitted per client IP (default 4) */
  VERIFY_MAX_CONCURRENT_PER_IP: getEnvNumber("VERIFY_MAX_CONCURRENT_PER_IP", 4),

  /** Maximum number of supporting pages discovered and fetched per website check (default 3) */
  SUPPORTING_PAGES_MAX_COUNT: getEnvNumber("SUPPORTING_PAGES_MAX_COUNT", 3),

  /** Maximum time allowed per individual supporting-page HTTP fetch (default 5s) */
  SUPPORTING_PAGE_FETCH_TIMEOUT_MS: getEnvNumber("SUPPORTING_PAGE_FETCH_TIMEOUT_MS", 5000),

  /** Maximum total wall-clock time allowed for all supporting-page fetches combined (default 8s) */
  SUPPORTING_PAGES_TOTAL_TIMEOUT_MS: getEnvNumber("SUPPORTING_PAGES_TOTAL_TIMEOUT_MS", 8000),

  /** Maximum response body size streamed per supporting page (default 2MB) */
  SUPPORTING_PAGE_MAX_RESPONSE_BYTES: getEnvNumber("SUPPORTING_PAGE_MAX_RESPONSE_BYTES", 2000000),

  /** Maximum HTTP redirects followed per supporting page (default 3) */
  SUPPORTING_PAGE_MAX_REDIRECTS: getEnvNumber("SUPPORTING_PAGE_MAX_REDIRECTS", 3),

  /** Maximum characters of HTML passed to Cheerio DOM extraction for a supporting page (default 120,000) */
  SUPPORTING_PAGE_MAX_HTML_CHARS: getEnvNumber("SUPPORTING_PAGE_MAX_HTML_CHARS", 120000),

  /** Maximum concurrent supporting-page fetch requests per check (default 3) */
  SUPPORTING_PAGES_CONCURRENCY: getEnvNumber("SUPPORTING_PAGES_CONCURRENCY", 3),

  /** Feature flag default state for Multi-Page Supporting Context Analysis (default false / OFF) */
  ENABLE_SUPPORTING_PAGES_ANALYSIS: getEnvBoolean("ENABLE_SUPPORTING_PAGES_ANALYSIS", false),

  /** Maximum timeout for the single combined supporting-context AI request (default 12s) */
  SUPPORTING_CONTEXT_AI_TIMEOUT_MS: getEnvNumber("SUPPORTING_CONTEXT_AI_TIMEOUT_MS", 12000),

  /** Maximum character budget for the combined supporting-context AI prompt payload (default 4,500 chars) */
  SUPPORTING_CONTEXT_MAX_INPUT_CHARS: getEnvNumber("SUPPORTING_CONTEXT_MAX_INPUT_CHARS", 4500),
} as const;

export type ServerLimits = typeof SERVER_LIMITS;
