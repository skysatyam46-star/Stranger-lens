import { checkSsrf, normalizeUrl } from "./url-validator";
import { SERVER_LIMITS } from "@/server/config/limits";

export interface FetchSuccessResult {
  success: true;
  originalUrl: string;
  normalizedUrl: string;
  finalUrl: string;
  domain: string;
  status: number;
  statusText: string;
  contentType: string;
  contentLength: number;
  redirectCount: number;
  redirectHistory: string[];
  timingMs: number;
  html: string;
}

export interface FetchErrorResult {
  success: false;
  error:
    | "INVALID_URL"
    | "SSRF_BLOCKED"
    | "WEBSITE_FETCH_TIMEOUT"
    | "FETCH_TIMEOUT"
    | "WEBSITE_RESPONSE_TOO_LARGE"
    | "TOO_MANY_REDIRECTS"
    | "FETCH_FAILED"
    | "HTTP_ERROR";
  message: string;
  originalUrl: string;
  normalizedUrl?: string;
  finalUrl?: string;
  domain?: string;
  status?: number;
  statusText?: string;
  redirectCount?: number;
  redirectHistory?: string[];
  timingMs?: number;
}

export type FetchResult = FetchSuccessResult | FetchErrorResult;

export interface FetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxSizeBytes?: number;
  userAgent?: string;
  signal?: AbortSignal;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 StrangerLens-Bot/1.0 (+https://strangerlens.app)";

/**
 * Safely fetches the homepage of a target website with SSRF protection,
 * redirect limits, timeout handling, stream response body size limits,
 * and cancellation signal propagation.
 */
export async function fetchWebsiteHomepage(
  rawUrl: string,
  normalizedUrl: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? SERVER_LIMITS.WEBSITE_FETCH_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? SERVER_LIMITS.WEBSITE_MAX_REDIRECTS;
  const maxSizeBytes = options.maxSizeBytes ?? SERVER_LIMITS.WEBSITE_MAX_RESPONSE_BYTES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const parentSignal = options.signal;

  const startTime = performance.now();
  let currentUrl = normalizedUrl;
  const redirectHistory: string[] = [];

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    // Check parent cancellation before initiating each hop
    if (parentSignal?.aborted) {
      const elapsed = Math.round(performance.now() - startTime);
      return {
        success: false,
        error: "FETCH_TIMEOUT",
        message: "Analysis deadline exceeded. Request cancelled.",
        originalUrl: rawUrl,
        normalizedUrl,
        finalUrl: currentUrl,
        redirectCount: redirectHistory.length,
        redirectHistory,
        timingMs: elapsed,
      };
    }

    // 1. SSRF Check before every HTTP request (including redirects)
    const ssrfResult = await checkSsrf(currentUrl);
    if (!ssrfResult.isSafe) {
      const elapsed = Math.round(performance.now() - startTime);
      return {
        success: false,
        error: ssrfResult.isDnsFailure
          ? redirectCount > 0
            ? "FETCH_FAILED"
            : "INVALID_URL"
          : "SSRF_BLOCKED",
        message: ssrfResult.reason || "Destination address blocked by security policy",
        originalUrl: rawUrl,
        normalizedUrl,
        finalUrl: currentUrl,
        redirectCount: redirectHistory.length,
        redirectHistory,
        timingMs: elapsed,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Link parent signal abort to local controller
    const parentAbortHandler = () => controller.abort();
    if (parentSignal) {
      parentSignal.addEventListener("abort", parentAbortHandler, { once: true });
    }

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      // 2. Handle HTTP Redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener("abort", parentAbortHandler);

        const locationHeader = response.headers.get("location");
        if (!locationHeader) {
          const elapsed = Math.round(performance.now() - startTime);
          return {
            success: false,
            error: "HTTP_ERROR",
            message: `Website returned redirect status code ${response.status} without a Location header`,
            originalUrl: rawUrl,
            normalizedUrl,
            finalUrl: currentUrl,
            status: response.status,
            statusText: response.statusText,
            redirectCount: redirectHistory.length,
            redirectHistory,
            timingMs: elapsed,
          };
        }

        if (redirectCount >= maxRedirects) {
          const elapsed = Math.round(performance.now() - startTime);
          return {
            success: false,
            error: "TOO_MANY_REDIRECTS",
            message: `Too many HTTP redirects (exceeded maximum limit of ${maxRedirects})`,
            originalUrl: rawUrl,
            normalizedUrl,
            finalUrl: currentUrl,
            redirectCount: redirectHistory.length,
            redirectHistory,
            timingMs: elapsed,
          };
        }

        // Resolve relative redirect URL against current target URL
        let resolvedNextUrl: string;
        try {
          resolvedNextUrl = new URL(locationHeader, currentUrl).href;
        } catch {
          const elapsed = Math.round(performance.now() - startTime);
          return {
            success: false,
            error: "FETCH_FAILED",
            message: `Invalid redirect URL location header: '${locationHeader}'`,
            originalUrl: rawUrl,
            normalizedUrl,
            finalUrl: currentUrl,
            redirectCount: redirectHistory.length,
            redirectHistory,
            timingMs: elapsed,
          };
        }

        redirectHistory.push(currentUrl);
        currentUrl = resolvedNextUrl;
        continue; // Follow redirect in next iteration (with SSRF validation)
      }

      // 3. Handle Error HTTP Status Codes (4xx, 5xx)
      if (response.status >= 400) {
        clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener("abort", parentAbortHandler);
        const elapsed = Math.round(performance.now() - startTime);
        return {
          success: false,
          error: "HTTP_ERROR",
          message: `Website returned HTTP error ${response.status} (${response.statusText || "Server Error"})`,
          originalUrl: rawUrl,
          normalizedUrl,
          finalUrl: currentUrl,
          status: response.status,
          statusText: response.statusText || "HTTP Error",
          redirectCount: redirectHistory.length,
          redirectHistory,
          timingMs: elapsed,
        };
      }

      // 4. Handle Successful HTTP Response (200 - 299)
      const contentType = response.headers.get("content-type") || "text/html";
      const lowerContentType = contentType.toLowerCase();

      // Reject binary / non-document content types before downloading payload
      if (
        lowerContentType.startsWith("image/") ||
        lowerContentType.startsWith("video/") ||
        lowerContentType.startsWith("audio/") ||
        lowerContentType.startsWith("font/") ||
        lowerContentType.includes("application/pdf") ||
        lowerContentType.includes("application/zip") ||
        lowerContentType.includes("application/octet-stream") ||
        lowerContentType.includes("application/x-msdownload") ||
        lowerContentType.includes("application/gzip")
      ) {
        clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener("abort", parentAbortHandler);
        if (response.body) {
          await response.body.cancel("Unsupported binary content type").catch(() => {});
        }
        const elapsed = Math.round(performance.now() - startTime);
        return {
          success: false,
          error: "FETCH_FAILED",
          message: `Target URL returned an unsupported non-HTML content type (${contentType.split(";")[0]})`,
          originalUrl: rawUrl,
          normalizedUrl,
          finalUrl: currentUrl,
          redirectCount: redirectHistory.length,
          redirectHistory,
          timingMs: elapsed,
        };
      }

      // Check declared Content-Length header upfront before streaming bytes
      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader) {
        const declaredBytes = parseInt(contentLengthHeader, 10);
        if (!Number.isNaN(declaredBytes) && declaredBytes > maxSizeBytes) {
          clearTimeout(timer);
          if (parentSignal) parentSignal.removeEventListener("abort", parentAbortHandler);
          if (response.body) {
            await response.body.cancel("Content-Length exceeded maximum allowed limit").catch(() => {});
          }
          const elapsed = Math.round(performance.now() - startTime);
          return {
            success: false,
            error: "WEBSITE_RESPONSE_TOO_LARGE",
            message: "This website is too large to check right now.",
            originalUrl: rawUrl,
            normalizedUrl,
            finalUrl: currentUrl,
            redirectCount: redirectHistory.length,
            redirectHistory,
            timingMs: elapsed,
          };
        }
      }

      // 5. Stream reading with strict byte-by-byte size enforcement (do NOT download unlimited body)
      let html = "";
      if (!response.body) {
        html = await response.text();
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let totalBytesRead = 0;
        let isTooLarge = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              totalBytesRead += value.length;
              if (totalBytesRead > maxSizeBytes) {
                isTooLarge = true;
                await reader.cancel("Response size exceeded maximum allowed limit");
                break;
              }
              html += decoder.decode(value, { stream: true });
            }
          }
          html += decoder.decode(); // Flush remainder
        } catch (streamErr) {
          if (!isTooLarge) throw streamErr;
        } finally {
          reader.releaseLock();
        }

        if (isTooLarge) {
          clearTimeout(timer);
          if (parentSignal) parentSignal.removeEventListener("abort", parentAbortHandler);
          const elapsed = Math.round(performance.now() - startTime);
          return {
            success: false,
            error: "WEBSITE_RESPONSE_TOO_LARGE",
            message: "This website is too large to check right now.",
            originalUrl: rawUrl,
            normalizedUrl,
            finalUrl: currentUrl,
            redirectCount: redirectHistory.length,
            redirectHistory,
            timingMs: elapsed,
          };
        }
      }

      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", parentAbortHandler);
      const elapsed = Math.round(performance.now() - startTime);

      const { domain } = normalizeUrl(currentUrl);

      return {
        success: true,
        originalUrl: rawUrl,
        normalizedUrl,
        finalUrl: currentUrl,
        domain,
        status: response.status,
        statusText: response.statusText || "OK",
        contentType,
        contentLength: html.length,
        redirectCount: redirectHistory.length,
        redirectHistory,
        timingMs: elapsed,
        html,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", parentAbortHandler);
      const elapsed = Math.round(performance.now() - startTime);

      if (err instanceof Error && err.name === "AbortError") {
        const isGlobalDeadline = parentSignal?.aborted;
        return {
          success: false,
          error: isGlobalDeadline ? "FETCH_TIMEOUT" : "WEBSITE_FETCH_TIMEOUT",
          message: isGlobalDeadline
            ? "We couldn't complete the analysis in time. Please try again."
            : `Website fetch timed out after ${timeoutMs / 1000} seconds`,
          originalUrl: rawUrl,
          normalizedUrl,
          finalUrl: currentUrl,
          redirectCount: redirectHistory.length,
          redirectHistory,
          timingMs: elapsed,
        };
      }

      return {
        success: false,
        error: "FETCH_FAILED",
        message:
          err instanceof Error
            ? `Failed to fetch website homepage: ${err.message}`
            : "Failed to connect to website. Please verify the URL and server availability.",
        originalUrl: rawUrl,
        normalizedUrl,
        finalUrl: currentUrl,
        redirectCount: redirectHistory.length,
        redirectHistory,
        timingMs: elapsed,
      };
    }
  }

  const elapsed = Math.round(performance.now() - startTime);
  return {
    success: false,
    error: "TOO_MANY_REDIRECTS",
    message: `Too many HTTP redirects (exceeded maximum limit of ${maxRedirects})`,
    originalUrl: rawUrl,
    normalizedUrl,
    finalUrl: currentUrl,
    redirectCount: redirectHistory.length,
    redirectHistory,
    timingMs: elapsed,
  };
}
