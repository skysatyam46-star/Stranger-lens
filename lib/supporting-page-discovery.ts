import * as cheerio from "cheerio";
import { SERVER_LIMITS } from "@/server/config/limits";

export type SupportingPageType =
  | "pricing"
  | "features"
  | "product"
  | "how_it_works"
  | "solutions"
  | "use_cases"
  | "customers"
  | "security"
  | "about"
  | "docs"
  | "other";

export type SupportingPageCategoryGroup =
  | "pricing"
  | "product_features"
  | "audience_solutions"
  | "trust_proof"
  | "company_about"
  | "docs_integrations";

export type SupportingLinkLocation = "header" | "hero" | "main" | "footer";

export interface DiscoveredSupportingPageCandidate {
  url: string;
  normalizedUrl: string;
  path: string;
  anchorText: string;
  pageType: SupportingPageType;
  categoryGroup: SupportingPageCategoryGroup;
  sourceLocation: SupportingLinkLocation;
  relevanceScore: number;
}

export interface DiscoveryOptions {
  maxPages?: number;
}

const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "ref",
  "fbclid",
  "gclid",
  "msclkid",
  "twclid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "hsctatracking",
  "hsa_acc",
  "hsa_cam",
  "hsa_grp",
  "hsa_ad",
  "hsa_src",
  "hsa_tgt",
  "hsa_kw",
  "hsa_mt",
  "hsa_net",
  "hsa_ver",
]);

const NON_HTML_EXTENSIONS = new Set([
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".rar",
  ".7z",
  ".exe",
  ".dmg",
  ".pkg",
  ".deb",
  ".rpm",
  ".iso",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".bmp",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mp3",
  ".wav",
  ".ogg",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".map",
  ".json",
  ".xml",
  ".rss",
  ".atom",
  ".txt",
  ".csv",
  ".tsv",
  ".md",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".wasm",
]);

const EXCLUDED_PATH_SEGMENTS = new Set([
  // Auth / Account / Portal / App / Checkout traps
  "login",
  "log-in",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "register",
  "registration",
  "auth",
  "oauth",
  "sso",
  "logout",
  "password",
  "forgot-password",
  "reset-password",
  "verify",
  "onboarding",
  "dashboard",
  "console",
  "portal",
  "admin",
  "wp-admin",
  "account",
  "my-account",
  "profile",
  "settings",
  "preferences",
  "cart",
  "checkout",
  "billing",
  "subscribe",
  "unsubscribe",
  // Legal / Policy / Boilerplate
  "privacy",
  "privacy-policy",
  "terms",
  "terms-of-service",
  "terms-and-conditions",
  "tos",
  "cookie",
  "cookies",
  "cookie-policy",
  "legal",
  "gdpr",
  "ccpa",
  "dpa",
  "imprint",
  "impressum",
  "disclaimer",
  "accessibility",
  "sitemap",
  // Blog / News / Content Archives / Careers / Support
  "blog",
  "blogs",
  "articles",
  "news",
  "press",
  "press-kit",
  "media",
  "podcast",
  "podcasts",
  "webinar",
  "webinars",
  "events",
  "careers",
  "jobs",
  "hiring",
  "work-with-us",
  "help",
  "support",
  "kb",
  "knowledge-base",
  "ticket",
  "status",
  "changelog",
  "release-notes",
  "releases",
  "roadmap",
  "forum",
  "community",
  "affiliates",
  "contact",
  "contact-us",
  // System / Framework paths
  "api",
  "_next",
  "static",
  "assets",
  "public",
  "cdn-cgi",
  "wp-content",
  "wp-includes",
  "wp-json",
  "feed",
  "rss",
  "graphql",
]);

const LOCALE_ROOT_CODES = new Set([
  "en",
  "fr",
  "de",
  "es",
  "ja",
  "zh",
  "pt",
  "it",
  "nl",
  "ko",
  "ru",
  "pl",
  "sv",
  "da",
  "fi",
  "no",
  "tr",
  "ar",
  "hi",
  "en-us",
  "en-gb",
  "pt-br",
  "es-es",
  "es-mx",
  "zh-cn",
  "zh-tw",
  "fr-fr",
  "de-de",
]);

function cleanAnchorText(str: string | undefined): string {
  if (!str) return "";
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Normalizes a hostname or URL into a canonical host string (lowercase, strips leading `www.`).
 */
export function normalizeWebsiteHost(urlOrHost: string): string {
  if (!urlOrHost) return "";
  const trimmed = urlOrHost.trim().toLowerCase();
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .split("#")[0];
  }
}

/**
 * Checks whether a candidate URL belongs strictly to the same website domain as the base homepage URL.
 * Allows exact hostname match or `www.` equivalent (e.g. `acme.com` <-> `www.acme.com`).
 * Rejects external domains and separate subdomains (e.g. `app.acme.com`, `status.acme.com`, `medium.com`).
 */
export function isSameWebsiteDomain(candidateUrl: string, baseUrl: string): boolean {
  try {
    const candidateParsed = new URL(candidateUrl);
    const baseParsed = new URL(baseUrl);
    if (
      candidateParsed.protocol !== "http:" &&
      candidateParsed.protocol !== "https:"
    ) {
      return false;
    }
    const candidateHost = candidateParsed.hostname.toLowerCase().replace(/^www\./, "");
    const baseHost = baseParsed.hostname.toLowerCase().replace(/^www\./, "");
    return Boolean(candidateHost && baseHost && candidateHost === baseHost);
  } catch {
    return false;
  }
}

/**
 * Normalizes a pathname by collapsing duplicate slashes, stripping index suffixes,
 * and removing trailing slashes (except root `/`).
 */
export function normalizeSupportingPathname(rawPathname: string): string {
  if (!rawPathname) return "/";
  let path = rawPathname
    .replace(/\/{2,}/g, "/")
    .replace(/\/index\.(html?|php)$/i, "");
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path || "/";
}

/**
 * Resolves and canonicalizes a candidate href against the homepage baseUrl.
 * Returns null if the link is invalid, non-HTTP(S), cross-domain, query-dynamic, or points to the homepage itself.
 */
export function canonicalizeSupportingUrl(
  rawHref: string | undefined,
  baseUrl: string
): string | null {
  if (!rawHref || !baseUrl) return null;
  const trimmed = rawHref.trim();
  if (!trimmed) return null;

  // Reject pure fragment links and non-web protocols early
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("#") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("sms:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("ftp:") ||
    lower.startsWith("file:") ||
    lower.startsWith("ws:") ||
    lower.startsWith("wss:")
  ) {
    return null;
  }

  let parsed: URL;
  let baseParsed: URL;
  try {
    baseParsed = new URL(baseUrl);
    parsed = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  if (!isSameWebsiteDomain(parsed.href, baseParsed.href)) {
    return null;
  }

  // Strip fragment
  parsed.hash = "";

  // Strip known marketing tracking query parameters
  const keysToDelete: string[] = [];
  parsed.searchParams.forEach((_, key) => {
    const kLower = key.toLowerCase();
    if (kLower.startsWith("utm_") || TRACKING_QUERY_PARAMS.has(kLower)) {
      keysToDelete.push(key);
    }
  });
  for (const k of keysToDelete) {
    parsed.searchParams.delete(k);
  }

  // Reject URLs that still contain dynamic query parameters (e.g. ?page=2, ?id=123, ?redirect=...)
  if (Array.from(parsed.searchParams.keys()).length > 0) {
    return null;
  }
  parsed.search = "";

  // Canonicalize protocol and host to match the resolved homepage origin so `www.` vs non-`www.` doesn't cause unnecessary redirects
  parsed.protocol = baseParsed.protocol;
  parsed.host = baseParsed.host;
  parsed.pathname = normalizeSupportingPathname(parsed.pathname);

  const baseCanonicalPath = normalizeSupportingPathname(baseParsed.pathname);
  if (parsed.pathname === "/" || parsed.pathname === baseCanonicalPath) {
    return null;
  }

  if (parsed.href.length > 250) {
    return null;
  }

  return parsed.href;
}

/**
 * Checks if a normalized pathname or anchor text represents an excluded trap
 * (auth, legal, blog/archive, asset file, deep path, or locale root).
 */
export function isExcludedSupportingPath(
  pathname: string,
  anchorText = ""
): { excluded: boolean; reason?: string } {
  const normPath = normalizeSupportingPathname(pathname).toLowerCase();
  if (normPath === "/" || !normPath) {
    return { excluded: true, reason: "HOMEPAGE_ROOT" };
  }

  // Check file extension
  const lastDotIdx = normPath.lastIndexOf(".");
  const lastSlashIdx = normPath.lastIndexOf("/");
  if (lastDotIdx > lastSlashIdx) {
    const ext = normPath.slice(lastDotIdx);
    if (ext !== ".html" && ext !== ".htm" && ext !== ".php") {
      if (NON_HTML_EXTENSIONS.has(ext) || ext.length <= 6) {
        return { excluded: true, reason: "NON_HTML_EXTENSION" };
      }
    }
  }

  const segments = normPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { excluded: true, reason: "EMPTY_PATH" };
  }

  // Reject overly deep paths (> 3 segments)
  if (segments.length > 3) {
    return { excluded: true, reason: "PATH_TOO_DEEP" };
  }

  // Reject pure language/locale root switchers (e.g. /fr, /de, /en-gb)
  if (segments.length === 1 && LOCALE_ROOT_CODES.has(segments[0])) {
    return { excluded: true, reason: "LOCALE_ROOT_SWITCHER" };
  }

  for (const seg of segments) {
    const cleanSeg = seg.replace(/\.(html?|php)$/i, "");
    if (EXCLUDED_PATH_SEGMENTS.has(cleanSeg)) {
      return { excluded: true, reason: `EXCLUDED_SEGMENT:${cleanSeg}` };
    }

    // Reject date archive segments (e.g. /2024/, /2025/)
    if (/^(19|20)\d{2}$/.test(cleanSeg)) {
      return { excluded: true, reason: "DATE_ARCHIVE_SEGMENT" };
    }

    // Reject long blog-post-style slugs (> 55 chars)
    if (cleanSeg.length > 55) {
      return { excluded: true, reason: "SLUG_TOO_LONG" };
    }

    // Prefix checks for common auth/legal/blog compound slugs
    if (
      cleanSeg.startsWith("login-") ||
      cleanSeg.startsWith("signup-") ||
      cleanSeg.startsWith("sign-in") ||
      cleanSeg.startsWith("sign-up") ||
      cleanSeg.startsWith("privacy-") ||
      cleanSeg.startsWith("terms-") ||
      cleanSeg.startsWith("cookie-") ||
      cleanSeg.startsWith("blog-") ||
      cleanSeg.startsWith("wp-")
    ) {
      return { excluded: true, reason: `EXCLUDED_PREFIX:${cleanSeg}` };
    }
  }

  // Also check anchor text for explicit auth/legal/utility traps
  const lowerText = cleanAnchorText(anchorText).toLowerCase();
  if (
    lowerText === "log in" ||
    lowerText === "login" ||
    lowerText === "sign in" ||
    lowerText === "sign up" ||
    lowerText === "register" ||
    lowerText === "privacy policy" ||
    lowerText === "terms of service" ||
    lowerText === "terms & conditions" ||
    lowerText === "cookie policy" ||
    lowerText === "forgot password"
  ) {
    return { excluded: true, reason: "EXCLUDED_ANCHOR_TEXT" };
  }

  return { excluded: false };
}

/**
 * Classifies a candidate supporting page into a structured `SupportingPageType`,
 * `SupportingPageCategoryGroup`, and base relevance score.
 */
export function classifySupportingPageCandidate(
  pathname: string,
  anchorText: string
): {
  pageType: SupportingPageType;
  categoryGroup: SupportingPageCategoryGroup;
  baseScore: number;
} {
  const lowerPath = normalizeSupportingPathname(pathname).toLowerCase();
  const segments = lowerPath.split("/").filter(Boolean);
  const firstSeg = (segments[0] || "").replace(/\.(html?|php)$/i, "");
  const combinedPath = segments.join(" ");
  const lowerText = cleanAnchorText(anchorText).toLowerCase();

  const matchesAny = (keywords: string[]): boolean =>
    keywords.some(
      (kw) =>
        firstSeg === kw ||
        combinedPath.includes(kw) ||
        lowerText === kw ||
        lowerText.includes(kw)
    );

  // 1. Pricing & Plans (Highest value for understanding offer, tiers, trials, guarantees)
  if (
    matchesAny(["pricing", "plans", "price", "packages", "tiers", "subscriptions"])
  ) {
    return {
      pageType: "pricing",
      categoryGroup: "pricing",
      baseScore: 100,
    };
  }

  // 2. Product / Overview / Platform / Tour (Core explanation of what the product is)
  if (
    matchesAny([
      "product",
      "products",
      "platform",
      "overview",
      "tour",
      "product-tour",
      "what-we-do",
    ])
  ) {
    return {
      pageType: "product",
      categoryGroup: "product_features",
      baseScore: 95,
    };
  }

  // 3. Features / Capabilities (Core explanation of what the visitor gets)
  if (matchesAny(["features", "feature", "capabilities", "modules", "tools"])) {
    return {
      pageType: "features",
      categoryGroup: "product_features",
      baseScore: 95,
    };
  }

  // 4. How It Works / Workflow
  if (
    matchesAny([
      "how-it-works",
      "how it works",
      "workflow",
      "workflows",
      "process",
      "methodology",
    ])
  ) {
    return {
      pageType: "how_it_works",
      categoryGroup: "product_features",
      baseScore: 90,
    };
  }

  // 5. Solutions / Enterprise / Industries / Teams (Clarifies target audience)
  if (
    matchesAny([
      "solutions",
      "solution",
      "enterprise",
      "teams",
      "for-teams",
      "industries",
      "services",
    ])
  ) {
    return {
      pageType: "solutions",
      categoryGroup: "audience_solutions",
      baseScore: 86,
    };
  }

  // 6. Use Cases / Examples
  if (
    matchesAny([
      "use-cases",
      "use cases",
      "usecases",
      "examples",
      "templates",
      "scenarios",
    ])
  ) {
    return {
      pageType: "use_cases",
      categoryGroup: "audience_solutions",
      baseScore: 85,
    };
  }

  // 7. Customers / Case Studies / Stories / Testimonials (Clarifies trust & social proof)
  if (
    matchesAny([
      "customers",
      "customer-stories",
      "case-studies",
      "case studies",
      "stories",
      "testimonials",
      "reviews",
      "clients",
      "wall-of-love",
    ])
  ) {
    return {
      pageType: "customers",
      categoryGroup: "trust_proof",
      baseScore: 82,
    };
  }

  // 8. About / Company / Why Us / Mission
  if (
    matchesAny([
      "about",
      "about-us",
      "about us",
      "company",
      "mission",
      "why-us",
      "why ",
      "our-story",
      "team",
    ])
  ) {
    return {
      pageType: "about",
      categoryGroup: "company_about",
      baseScore: 76,
    };
  }

  // 9. Security / Trust Center / Compliance
  if (
    matchesAny(["security", "trust", "trust-center", "compliance", "safety"])
  ) {
    return {
      pageType: "security",
      categoryGroup: "trust_proof",
      baseScore: 72,
    };
  }

  // 10. Docs / Integrations / Developers
  if (
    matchesAny([
      "docs",
      "documentation",
      "integrations",
      "developers",
      "guides",
      "faq",
    ])
  ) {
    return {
      pageType: "docs",
      categoryGroup: "docs_integrations",
      baseScore: 62,
    };
  }

  return {
    pageType: "other",
    categoryGroup: "docs_integrations",
    baseScore: 35,
  };
}

function getLocationBonus(location: SupportingLinkLocation): number {
  switch (location) {
    case "header":
      return 25;
    case "hero":
      return 20;
    case "main":
      return 10;
    case "footer":
      return 5;
  }
}

function getPathDepthBonus(pathname: string): number {
  const segments = normalizeSupportingPathname(pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length === 1) return 10;
  if (segments.length === 2) return 0;
  return -10;
}

/**
 * Discovers, filters, scores, and selects up to `maxPages` (default 3) high-signal
 * internal supporting pages from the fetched homepage HTML.
 */
export function discoverSupportingPages(
  html: string,
  homepageUrl: string,
  options: DiscoveryOptions = {}
): DiscoveredSupportingPageCandidate[] {
  const maxPages = options.maxPages ?? SERVER_LIMITS.SUPPORTING_PAGES_MAX_COUNT;
  if (!html || !homepageUrl || maxPages <= 0) {
    return [];
  }

  const maxHtmlChars = SERVER_LIMITS.WEBSITE_MAX_HTML_CHARS;
  const boundedHtml =
    html.length > maxHtmlChars ? html.slice(0, maxHtmlChars) : html;

  const $ = cheerio.load(boundedHtml);

  // Strip non-content elements before link extraction
  $("script, style, noscript, svg, iframe, object, embed").remove();
  $(
    '[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"], [aria-hidden="true"]'
  ).remove();

  const candidateMap = new Map<
    string,
    DiscoveredSupportingPageCandidate & { orderIndex: number }
  >();

  let orderCounter = 0;

  $("a[href]").each((_, el) => {
    const $el = $(el);
    const rawHref = $el.attr("href");
    const anchorText = cleanAnchorText(
      $el.text() || $el.attr("aria-label") || $el.attr("title") || ""
    );

    // Skip empty or excessively long anchor text
    if (!anchorText || anchorText.length > 80) return;

    const canonicalUrl = canonicalizeSupportingUrl(rawHref, homepageUrl);
    if (!canonicalUrl) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(canonicalUrl);
    } catch {
      return;
    }

    const pathname = normalizeSupportingPathname(parsedUrl.pathname);
    const exclusion = isExcludedSupportingPath(pathname, anchorText);
    if (exclusion.excluded) return;

    // Determine structural location on the homepage
    let sourceLocation: SupportingLinkLocation = "main";
    if (
      $el.closest("header, nav, [role='navigation'], .header, .nav, .navbar")
        .length > 0
    ) {
      sourceLocation = "header";
    } else if (
      $el.closest(
        ".hero, #hero, .banner, .intro, header + section, main section:first-of-type, section:first-of-type"
      ).length > 0
    ) {
      sourceLocation = "hero";
    } else if (
      $el.closest("footer, [role='contentinfo'], .footer, #footer").length > 0
    ) {
      sourceLocation = "footer";
    }

    const classification = classifySupportingPageCandidate(
      pathname,
      anchorText
    );
    const relevanceScore =
      classification.baseScore +
      getLocationBonus(sourceLocation) +
      getPathDepthBonus(pathname);

    // Minimum relevance threshold: avoid crawling random body/footer "other" links
    if (classification.pageType === "other" && relevanceScore < 65) {
      return;
    }

    const existing = candidateMap.get(canonicalUrl);
    if (!existing || relevanceScore > existing.relevanceScore) {
      candidateMap.set(canonicalUrl, {
        url: canonicalUrl,
        normalizedUrl: canonicalUrl,
        path: pathname,
        anchorText,
        pageType: classification.pageType,
        categoryGroup: classification.categoryGroup,
        sourceLocation,
        relevanceScore,
        orderIndex: existing ? existing.orderIndex : orderCounter++,
      });
    }
  });

  // Sort all deduplicated candidates by relevanceScore DESC, then appearance order ASC
  const sortedCandidates = Array.from(candidateMap.values()).sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return a.orderIndex - b.orderIndex;
  });

  // Diversity-aware selection:
  // Pass 1: Pick the highest-scoring candidate from each distinct categoryGroup (excluding "other" pageType first)
  const selected: DiscoveredSupportingPageCandidate[] = [];
  const selectedUrls = new Set<string>();
  const usedGroups = new Set<SupportingPageCategoryGroup>();

  for (const candidate of sortedCandidates) {
    if (selected.length >= maxPages) break;
    if (
      candidate.pageType !== "other" &&
      !usedGroups.has(candidate.categoryGroup)
    ) {
      const { orderIndex: _idx, ...cleanCandidate } = candidate;
      selected.push(cleanCandidate);
      selectedUrls.add(candidate.normalizedUrl);
      usedGroups.add(candidate.categoryGroup);
    }
  }

  // Pass 2: Fill remaining slots up to maxPages with next highest-scoring candidates
  for (const candidate of sortedCandidates) {
    if (selected.length >= maxPages) break;
    if (!selectedUrls.has(candidate.normalizedUrl)) {
      const { orderIndex: _idx, ...cleanCandidate } = candidate;
      selected.push(cleanCandidate);
      selectedUrls.add(candidate.normalizedUrl);
    }
  }

  return selected;
}
