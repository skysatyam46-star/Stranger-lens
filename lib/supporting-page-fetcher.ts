import { SERVER_LIMITS } from "@/server/config/limits";
import {
  fetchWebsiteHomepage,
  type FetchOptions,
  type FetchResult,
} from "./website-fetcher";
import {
  extractWebsiteSnapshot,
  type WebsiteSnapshot,
} from "./content-extractor";
import {
  discoverSupportingPages,
  isSameWebsiteDomain,
  isExcludedSupportingPath,
  normalizeSupportingPathname,
  type DiscoveredSupportingPageCandidate,
  type SupportingLinkLocation,
  type SupportingPageType,
} from "./supporting-page-discovery";

export interface SupportingPageRecord {
  url: string;
  finalUrl: string;
  path: string;
  pageType: SupportingPageType;
  anchorText: string;
  sourceLocation: SupportingLinkLocation;
  relevanceScore: number;
  status: number;
  timingMs: number;
  contentLength: number;
  redirectCount: number;
  snapshot: WebsiteSnapshot;
}

export interface SupportingPageFetchAttempt {
  url: string;
  finalUrl?: string;
  pageType: SupportingPageType;
  anchorText: string;
  sourceLocation: SupportingLinkLocation;
  relevanceScore: number;
  success: boolean;
  status?: number;
  error?: string;
  message?: string;
  timingMs: number;
}

export interface SupportingPagesBundle {
  discoveredCount: number;
  attemptedCount: number;
  fetchedCount: number;
  totalTimingMs: number;
  candidates: DiscoveredSupportingPageCandidate[];
  pages: SupportingPageRecord[];
  attempts: SupportingPageFetchAttempt[];
}

export interface FetchSupportingPagesOptions {
  maxPages?: number;
  perPageTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxRedirects?: number;
  maxSizeBytes?: number;
  maxHtmlChars?: number;
  concurrency?: number;
  signal?: AbortSignal;
  /** Optional custom fetcher for deterministic unit testing */
  fetcher?: (
    rawUrl: string,
    normalizedUrl: string,
    options?: FetchOptions
  ) => Promise<FetchResult>;
}

/**
 * Safely fetches up to `maxPages` (default 3) discovered supporting pages with
 * strict SSRF protection, cross-domain redirect blocking, size/timeout caps,
 * and partial-failure resilience. Never throws; returns structured results.
 */
export async function fetchSupportingPages(
  candidates: DiscoveredSupportingPageCandidate[],
  homepageFinalUrl: string,
  options: FetchSupportingPagesOptions = {}
): Promise<SupportingPagesBundle> {
  const startTime = performance.now();
  const maxPages = options.maxPages ?? SERVER_LIMITS.SUPPORTING_PAGES_MAX_COUNT;
  const perPageTimeoutMs =
    options.perPageTimeoutMs ?? SERVER_LIMITS.SUPPORTING_PAGE_FETCH_TIMEOUT_MS;
  const totalTimeoutMs =
    options.totalTimeoutMs ?? SERVER_LIMITS.SUPPORTING_PAGES_TOTAL_TIMEOUT_MS;
  const maxRedirects =
    options.maxRedirects ?? SERVER_LIMITS.SUPPORTING_PAGE_MAX_REDIRECTS;
  const maxSizeBytes =
    options.maxSizeBytes ?? SERVER_LIMITS.SUPPORTING_PAGE_MAX_RESPONSE_BYTES;
  const maxHtmlChars =
    options.maxHtmlChars ?? SERVER_LIMITS.SUPPORTING_PAGE_MAX_HTML_CHARS;
  const concurrency = Math.max(
    1,
    options.concurrency ?? SERVER_LIMITS.SUPPORTING_PAGES_CONCURRENCY
  );
  const fetcher = options.fetcher ?? fetchWebsiteHomepage;
  const parentSignal = options.signal;

  const boundedCandidates = candidates.slice(0, maxPages);

  if (boundedCandidates.length === 0 || !homepageFinalUrl) {
    return {
      discoveredCount: candidates.length,
      attemptedCount: 0,
      fetchedCount: 0,
      totalTimingMs: 0,
      candidates: boundedCandidates,
      pages: [],
      attempts: [],
    };
  }

  let homepageCanonicalPath = "/";
  try {
    homepageCanonicalPath = normalizeSupportingPathname(
      new URL(homepageFinalUrl).pathname
    );
  } catch {
    homepageCanonicalPath = "/";
  }

  // Global deadline controller for all supporting-page fetches combined
  const batchController = new AbortController();
  const batchTimer = setTimeout(() => batchController.abort(), totalTimeoutMs);
  const parentAbortHandler = () => batchController.abort();
  if (parentSignal) {
    if (parentSignal.aborted) {
      batchController.abort();
    } else {
      parentSignal.addEventListener("abort", parentAbortHandler, {
        once: true,
      });
    }
  }

  const attempts: SupportingPageFetchAttempt[] = new Array(
    boundedCandidates.length
  );
  const rawFetchedResults: Array<{
    index: number;
    candidate: DiscoveredSupportingPageCandidate;
    fetchResult: Extract<FetchResult, { success: true }>;
  } | null> = new Array(boundedCandidates.length).fill(null);

  try {
    let cursor = 0;

    const worker = async () => {
      while (cursor < boundedCandidates.length) {
        const index = cursor++;
        const candidate = boundedCandidates[index];
        const candidateStart = performance.now();

        if (batchController.signal.aborted) {
          attempts[index] = {
            url: candidate.url,
            pageType: candidate.pageType,
            anchorText: candidate.anchorText,
            sourceLocation: candidate.sourceLocation,
            relevanceScore: candidate.relevanceScore,
            success: false,
            error: "FETCH_TIMEOUT",
            message: "Supporting-page total fetch budget exceeded",
            timingMs: Math.round(performance.now() - candidateStart),
          };
          continue;
        }

        try {
          const fetchResult = await fetcher(
            candidate.url,
            candidate.normalizedUrl,
            {
              timeoutMs: perPageTimeoutMs,
              maxRedirects,
              maxSizeBytes,
              signal: batchController.signal,
            }
          );

          if (!fetchResult.success) {
            attempts[index] = {
              url: candidate.url,
              finalUrl: fetchResult.finalUrl,
              pageType: candidate.pageType,
              anchorText: candidate.anchorText,
              sourceLocation: candidate.sourceLocation,
              relevanceScore: candidate.relevanceScore,
              success: false,
              status: fetchResult.status,
              error: fetchResult.error,
              message: fetchResult.message,
              timingMs:
                fetchResult.timingMs ??
                Math.round(performance.now() - candidateStart),
            };
            continue;
          }

          // Post-fetch guard 1: Verify redirect did not leave the website's domain
          if (!isSameWebsiteDomain(fetchResult.finalUrl, homepageFinalUrl)) {
            attempts[index] = {
              url: candidate.url,
              finalUrl: fetchResult.finalUrl,
              pageType: candidate.pageType,
              anchorText: candidate.anchorText,
              sourceLocation: candidate.sourceLocation,
              relevanceScore: candidate.relevanceScore,
              success: false,
              status: fetchResult.status,
              error: "CROSS_DOMAIN_REDIRECT",
              message:
                "Supporting page redirected to an external domain and was skipped",
              timingMs: fetchResult.timingMs,
            };
            continue;
          }

          // Post-fetch guard 2: Verify finalUrl did not redirect back to the homepage or an excluded path
          let finalPathname = candidate.path;
          try {
            finalPathname = normalizeSupportingPathname(
              new URL(fetchResult.finalUrl).pathname
            );
          } catch {
            // keep candidate.path
          }

          if (
            finalPathname === "/" ||
            finalPathname === homepageCanonicalPath
          ) {
            attempts[index] = {
              url: candidate.url,
              finalUrl: fetchResult.finalUrl,
              pageType: candidate.pageType,
              anchorText: candidate.anchorText,
              sourceLocation: candidate.sourceLocation,
              relevanceScore: candidate.relevanceScore,
              success: false,
              status: fetchResult.status,
              error: "REDIRECTED_TO_HOMEPAGE",
              message:
                "Supporting page redirected back to the homepage and was skipped",
              timingMs: fetchResult.timingMs,
            };
            continue;
          }

          const finalPathExclusion = isExcludedSupportingPath(finalPathname);
          if (finalPathExclusion.excluded) {
            attempts[index] = {
              url: candidate.url,
              finalUrl: fetchResult.finalUrl,
              pageType: candidate.pageType,
              anchorText: candidate.anchorText,
              sourceLocation: candidate.sourceLocation,
              relevanceScore: candidate.relevanceScore,
              success: false,
              status: fetchResult.status,
              error: "EXCLUDED_REDIRECT_TARGET",
              message: `Supporting page redirected to an excluded path (${finalPathname})`,
              timingMs: fetchResult.timingMs,
            };
            continue;
          }

          rawFetchedResults[index] = {
            index,
            candidate,
            fetchResult,
          };
        } catch (err: unknown) {
          attempts[index] = {
            url: candidate.url,
            pageType: candidate.pageType,
            anchorText: candidate.anchorText,
            sourceLocation: candidate.sourceLocation,
            relevanceScore: candidate.relevanceScore,
            success: false,
            error: "FETCH_FAILED",
            message:
              err instanceof Error
                ? err.message
                : "Unexpected error fetching supporting page",
            timingMs: Math.round(performance.now() - candidateStart),
          };
        }
      }
    };

    const workersCount = Math.min(concurrency, boundedCandidates.length);
    await Promise.allSettled(
      Array.from({ length: workersCount }, () => worker())
    );
  } finally {
    clearTimeout(batchTimer);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", parentAbortHandler);
    }
  }

  // Deduplicate by final pathname and extract structured WebsiteSnapshot without retaining raw HTML
  const pages: SupportingPageRecord[] = [];
  const seenFinalPaths = new Set<string>([homepageCanonicalPath, "/"]);

  for (let i = 0; i < boundedCandidates.length; i++) {
    const item = rawFetchedResults[i];
    if (!item) continue;

    const { candidate, fetchResult } = item;
    let finalPath = candidate.path;
    try {
      finalPath = normalizeSupportingPathname(
        new URL(fetchResult.finalUrl).pathname
      );
    } catch {
      finalPath = candidate.path;
    }

    if (seenFinalPaths.has(finalPath)) {
      attempts[i] = {
        url: candidate.url,
        finalUrl: fetchResult.finalUrl,
        pageType: candidate.pageType,
        anchorText: candidate.anchorText,
        sourceLocation: candidate.sourceLocation,
        relevanceScore: candidate.relevanceScore,
        success: false,
        status: fetchResult.status,
        error: "DUPLICATE_FINAL_URL",
        message:
          "Supporting page resolved to a duplicate URL already included",
        timingMs: fetchResult.timingMs,
      };
      continue;
    }

    try {
      const snapshot = extractWebsiteSnapshot(fetchResult.html, {
        baseUrl: fetchResult.finalUrl,
        maxHtmlChars,
      });

      seenFinalPaths.add(finalPath);
      pages.push({
        url: candidate.url,
        finalUrl: fetchResult.finalUrl,
        path: finalPath,
        pageType: candidate.pageType,
        anchorText: candidate.anchorText,
        sourceLocation: candidate.sourceLocation,
        relevanceScore: candidate.relevanceScore,
        status: fetchResult.status,
        timingMs: fetchResult.timingMs,
        contentLength: fetchResult.contentLength,
        redirectCount: fetchResult.redirectCount,
        snapshot,
      });

      attempts[i] = {
        url: candidate.url,
        finalUrl: fetchResult.finalUrl,
        pageType: candidate.pageType,
        anchorText: candidate.anchorText,
        sourceLocation: candidate.sourceLocation,
        relevanceScore: candidate.relevanceScore,
        success: true,
        status: fetchResult.status,
        timingMs: fetchResult.timingMs,
      };
    } catch (extractErr: unknown) {
      attempts[i] = {
        url: candidate.url,
        finalUrl: fetchResult.finalUrl,
        pageType: candidate.pageType,
        anchorText: candidate.anchorText,
        sourceLocation: candidate.sourceLocation,
        relevanceScore: candidate.relevanceScore,
        success: false,
        status: fetchResult.status,
        error: "EXTRACTION_FAILED",
        message:
          extractErr instanceof Error
            ? extractErr.message
            : "Failed to extract supporting page content",
        timingMs: fetchResult.timingMs,
      };
    }
  }

  const totalTimingMs = Math.round(performance.now() - startTime);

  return {
    discoveredCount: candidates.length,
    attemptedCount: boundedCandidates.length,
    fetchedCount: pages.length,
    totalTimingMs,
    candidates: boundedCandidates,
    pages,
    attempts: attempts.filter(Boolean),
  };
}

/**
 * High-level orchestrator for Multi-Page Expansion Phase 1:
 * Discovers up to 3 relevant supporting pages from the homepage HTML and safely fetches + extracts them.
 * Never throws; any failure degrades gracefully to an empty `pages` array so homepage analysis is never blocked.
 */
export async function discoverAndFetchSupportingPages(
  homepageHtml: string,
  homepageFinalUrl: string,
  options: FetchSupportingPagesOptions = {}
): Promise<SupportingPagesBundle> {
  try {
    const maxPages =
      options.maxPages ?? SERVER_LIMITS.SUPPORTING_PAGES_MAX_COUNT;
    const candidates = discoverSupportingPages(homepageHtml, homepageFinalUrl, {
      maxPages,
    });
    return await fetchSupportingPages(candidates, homepageFinalUrl, options);
  } catch (err: unknown) {
    console.warn(
      "Supporting-page discovery/fetching encountered an unexpected error and degraded gracefully:",
      err instanceof Error ? err.message : "Unknown error"
    );
    return {
      discoveredCount: 0,
      attemptedCount: 0,
      fetchedCount: 0,
      totalTimingMs: 0,
      candidates: [],
      pages: [],
      attempts: [],
    };
  }
}
