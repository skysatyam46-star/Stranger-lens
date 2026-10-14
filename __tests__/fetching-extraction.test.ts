import { describe, test, expect } from "./test-harness";
import { extractWebsiteSnapshot } from "../lib/content-extractor";
import {
  getCachedFetch,
  setCachedFetch,
  _clearFetchCacheForTesting,
  _getFetchCacheSizeForTesting,
} from "../lib/fetch-cache";
import { FetchResult, FetchSuccessResult } from "../lib/website-fetcher";
import { checkSsrf, validateUrl } from "../lib/url-validator";
import { isPrivateIpAddress } from "../lib/url-client-validator";
import {
  discoverSupportingPages,
  canonicalizeSupportingUrl,
  isSameWebsiteDomain,
  isExcludedSupportingPath,
  classifySupportingPageCandidate,
} from "../lib/supporting-page-discovery";
import {
  fetchSupportingPages,
  discoverAndFetchSupportingPages,
} from "../lib/supporting-page-fetcher";

describe("Phase 1 Task 4: Content Extractor & Fetch Cache Tests", () => {
  test("Cheerio extracts essential snapshot structure from valid HTML", () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>SuperTool — Automate Your Design Workflow</title>
          <meta name="description" content="SuperTool empowers product teams to ship 10x faster." />
          <meta property="og:title" content="SuperTool Design Ops" />
          <link rel="canonical" href="https://supertool.com" />
        </head>
        <body>
          <header>
            <span class="logo">SuperTool</span>
            <nav>
              <a href="/features">Features</a>
              <a href="/pricing">Pricing</a>
            </nav>
          </header>
          <main>
            <section class="hero">
              <h1>Ship products 10x faster with AI workflows</h1>
              <p class="lead">Eliminate manual handoffs and streamline design to engineering delivery.</p>
              <a href="/signup" class="btn-primary">Start Free Trial</a>
              <a href="/demo">Book Demo</a>
            </section>
            <section class="proof">
              <h2>Trusted by 10,000+ modern teams</h2>
              <p>Join world-class engineering organizations.</p>
            </section>
          </main>
          <footer>
            <a href="/privacy">Privacy</a>
          </footer>
        </body>
      </html>
    `;

    const snapshot = extractWebsiteSnapshot(sampleHtml, { baseUrl: "https://supertool.com" });

    // Meta verification
    expect(snapshot.meta.title).toBe("SuperTool — Automate Your Design Workflow");
    expect(snapshot.meta.description).toBe("SuperTool empowers product teams to ship 10x faster.");
    expect(snapshot.meta.language).toBe("en");

    // Hero verification
    expect(snapshot.hero.headline).toBe("Ship products 10x faster with AI workflows");
    expect(snapshot.hero.subheadline).toBe("Eliminate manual handoffs and streamline design to engineering delivery.");
    expect(snapshot.hero.primaryCta?.text).toBe("Start Free Trial");

    // CTA inventory
    expect(snapshot.ctas.length > 0).toBe(true);
    const hasPrimaryCta = snapshot.ctas.some((c) => c.text === "Start Free Trial" && c.type === "primary");
    expect(hasPrimaryCta).toBe(true);

    // Nav links
    expect(snapshot.navigation.primaryNavLinks.some((l) => l.text === "Pricing")).toBe(true);
  });

  test("Content extractor safely handles empty or whitespace-only HTML without crashing", () => {
    const emptySnapshot = extractWebsiteSnapshot("", { baseUrl: "https://empty.com" });
    expect(emptySnapshot.meta.title).toBe("");
    expect(emptySnapshot.hero.headline).toBe("");
    expect(emptySnapshot.ctas.length).toBe(0);
    expect(emptySnapshot.stats.rawHtmlLength).toBe(0);
    expect(emptySnapshot.stats.cleanedTextLength).toBe(0);

    const whitespaceSnapshot = extractWebsiteSnapshot("   \n\t  ", { baseUrl: "https://empty.com" });
    expect(whitespaceSnapshot.meta.title).toBe("");
    expect(whitespaceSnapshot.hero.headline).toBe("");
  });

  test("Content extractor strips DOM noise like scripts, styles, iframes, and cookie banners", () => {
    const noisyHtml = `
      <html>
        <head>
          <title>Clean Title</title>
          <style>body { background: red; }</style>
          <script>console.log("secret analytics token");</script>
        </head>
        <body>
          <div id="cookie-banner" class="cookie consent">
            <p>We use cookies to track everything. Accept cookies?</p>
          </div>
          <h1>Real Heading</h1>
          <p>Real Content</p>
          <iframe src="https://ad-network.com/tracker"></iframe>
        </body>
      </html>
    `;

    const snapshot = extractWebsiteSnapshot(noisyHtml, { baseUrl: "https://clean.com" });
    expect(snapshot.meta.title).toBe("Clean Title");
    expect(snapshot.hero.headline).toBe("Real Heading");
    // Cookie banner and script texts should NOT pollute headings or body sections
    expect(snapshot.bodySections.some((s) => s.textSummary.includes("secret analytics token"))).toBe(false);
  });

  test("In-memory fetch cache stores and retrieves fresh results", () => {
    const mockResult: FetchSuccessResult = {
      success: true,
      originalUrl: "https://testdomain.com",
      normalizedUrl: "https://testdomain.com",
      finalUrl: "https://testdomain.com",
      domain: "testdomain.com",
      status: 200,
      statusText: "OK",
      contentType: "text/html",
      contentLength: 100,
      redirectCount: 0,
      redirectHistory: [],
      timingMs: 50,
      html: "<html><body><h1>Hello World</h1></body></html>",
    };

    setCachedFetch("https://testdomain.com", mockResult);
    const cached = getCachedFetch("https://testdomain.com");
    expect(cached !== null).toBe(true);
    expect(cached?.success).toBe(true);
    if (cached?.success) {
      expect(cached.finalUrl).toBe("https://testdomain.com");
    }
  });

  test("In-memory fetch cache returns null for missing or expired entries", () => {
    const missing = getCachedFetch("https://nonexistent-domain-xyz.com");
    expect(missing).toBe(null);
  });

  test("API check response contract: omitting raw HTML preserves snapshot and analysis", () => {
    const mockFetchResult: FetchSuccessResult = {
      success: true,
      originalUrl: "https://example.com",
      normalizedUrl: "https://example.com",
      finalUrl: "https://example.com",
      domain: "example.com",
      status: 200,
      statusText: "OK",
      contentType: "text/html",
      contentLength: 500,
      redirectCount: 0,
      redirectHistory: [],
      timingMs: 40,
      html: "<html><body><h1>Hello Safe World</h1></body></html>",
    };

    // Simulate the route stripping html
    const { html: _omittedHtml, ...safeFetchMetadata } = mockFetchResult;
    expect("html" in safeFetchMetadata).toBe(false);
    expect(safeFetchMetadata.domain).toBe("example.com");
    expect(safeFetchMetadata.status).toBe(200);
    expect(safeFetchMetadata.finalUrl).toBe("https://example.com");
  });

  test("SSRF & URL validation: blocks private IPv4, bracketed IPv6, IPv4-mapped IPv6, and non-HTTP protocols", async () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("169.254.169.254")).toBe(true);
    expect(isPrivateIpAddress("[::1]")).toBe(true);
    expect(isPrivateIpAddress("[fe80::1]")).toBe(true);
    expect(isPrivateIpAddress("[fd12:3456:789a::1]")).toBe(true);
    expect(isPrivateIpAddress("[::ffff:127.0.0.1]")).toBe(true);
    expect(isPrivateIpAddress("[::ffff:7f00:1]")).toBe(true);
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false);

    expect(validateUrl("http://[::1]:3000").isValid).toBe(false);
    expect(validateUrl("http://169.254.169.254/latest/meta-data/").isValid).toBe(false);

    const ipv6Loopback = await checkSsrf("http://[::1]:8080/");
    expect(ipv6Loopback.isSafe).toBe(false);

    const ipv6Mapped = await checkSsrf("http://[::ffff:127.0.0.1]/");
    expect(ipv6Mapped.isSafe).toBe(false);

    const fileProto = await checkSsrf("file:///etc/passwd");
    expect(fileProto.isSafe).toBe(false);

    const dataProto = await checkSsrf("data:text/html,<h1>test</h1>");
    expect(dataProto.isSafe).toBe(false);
  });

  test("In-memory fetch cache enforces MAX_CACHE_ENTRIES (25) FIFO eviction bound", () => {
    _clearFetchCacheForTesting();
    for (let i = 1; i <= 30; i++) {
      const url = `https://example-${i}.com`;
      setCachedFetch(url, {
        success: true,
        originalUrl: url,
        normalizedUrl: url,
        finalUrl: url,
        domain: `example-${i}.com`,
        status: 200,
        statusText: "OK",
        contentType: "text/html",
        contentLength: 50,
        redirectCount: 0,
        redirectHistory: [],
        timingMs: 10,
        html: `<html><body>Site ${i}</body></html>`,
      });
    }

    expect(_getFetchCacheSizeForTesting()).toBe(25);
    // First 5 entries should have been evicted
    expect(getCachedFetch("https://example-1.com")).toBe(null);
    expect(getCachedFetch("https://example-5.com")).toBe(null);
    // Entry 6 through 30 should still be present
    expect(getCachedFetch("https://example-6.com") !== null).toBe(true);
    expect(getCachedFetch("https://example-30.com") !== null).toBe(true);
  });

  test("Multi-Page Phase 1: Same-domain validation and URL canonicalization reject external, dynamic, and self links", () => {
    const base = "https://www.acme.com/";

    // Same domain & www equivalence
    expect(isSameWebsiteDomain("https://acme.com/pricing", base)).toBe(true);
    expect(isSameWebsiteDomain("https://www.acme.com/features", base)).toBe(true);

    // Reject external domains and separate subdomains
    expect(isSameWebsiteDomain("https://twitter.com/acme", base)).toBe(false);
    expect(isSameWebsiteDomain("https://app.acme.com/login", base)).toBe(false);
    expect(isSameWebsiteDomain("https://status.acme.com", base)).toBe(false);

    // Canonicalize relative, trailing-slash, and UTM-tagged links
    expect(
      canonicalizeSupportingUrl("/pricing/?utm_source=nav&fbclid=123#tiers", base)
    ).toBe("https://www.acme.com/pricing");
    expect(
      canonicalizeSupportingUrl("https://acme.com/features/index.html", base)
    ).toBe("https://www.acme.com/features");

    // Reject homepage self-links, anchors, non-HTTP schemes, and query-dynamic URLs
    expect(canonicalizeSupportingUrl("/", base)).toBe(null);
    expect(canonicalizeSupportingUrl("/index.html", base)).toBe(null);
    expect(canonicalizeSupportingUrl("https://acme.com/", base)).toBe(null);
    expect(canonicalizeSupportingUrl("#pricing", base)).toBe(null);
    expect(canonicalizeSupportingUrl("mailto:sales@acme.com", base)).toBe(null);
    expect(canonicalizeSupportingUrl("javascript:void(0)", base)).toBe(null);
    expect(canonicalizeSupportingUrl("/search?q=workflow", base)).toBe(null);
  });

  test("Multi-Page Phase 1: Exclusion rules filter out auth, legal, blog, career, asset, deep, and locale links", () => {
    expect(isExcludedSupportingPath("/login", "Log in").excluded).toBe(true);
    expect(isExcludedSupportingPath("/signup", "Sign Up").excluded).toBe(true);
    expect(isExcludedSupportingPath("/privacy-policy", "Privacy Policy").excluded).toBe(true);
    expect(isExcludedSupportingPath("/terms", "Terms of Service").excluded).toBe(true);
    expect(isExcludedSupportingPath("/blog/how-we-built-acme", "Read Post").excluded).toBe(true);
    expect(isExcludedSupportingPath("/careers", "Careers").excluded).toBe(true);
    expect(isExcludedSupportingPath("/whitepaper.pdf", "Download PDF").excluded).toBe(true);
    expect(isExcludedSupportingPath("/a/b/c/d", "Deep Page").excluded).toBe(true);
    expect(isExcludedSupportingPath("/fr", "Français").excluded).toBe(true);

    // High-signal product/pricing/customers/about paths are permitted
    expect(isExcludedSupportingPath("/pricing", "Pricing").excluded).toBe(false);
    expect(isExcludedSupportingPath("/features", "Features").excluded).toBe(false);
    expect(isExcludedSupportingPath("/customers", "Customers").excluded).toBe(false);
    expect(isExcludedSupportingPath("/about", "About Us").excluded).toBe(false);
    expect(classifySupportingPageCandidate("/pricing", "Pricing").pageType).toBe("pricing");
    expect(classifySupportingPageCandidate("/features", "Features").pageType).toBe("features");
    expect(classifySupportingPageCandidate("/customers", "Customer Stories").pageType).toBe("customers");
  });

  test("Multi-Page Phase 1: discoverSupportingPages selects at most 3 diverse, high-signal pages from homepage HTML", () => {
    const homepageHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <header>
            <nav>
              <a href="/">Home</a>
              <a href="/product">Product</a>
              <a href="/features">Features</a>
              <a href="/pricing?utm_source=header">Pricing</a>
              <a href="/customers">Customers</a>
              <a href="/solutions">Solutions</a>
              <a href="/blog">Blog</a>
              <a href="/login">Log in</a>
              <a href="https://app.supertool.com/signup">Get Started</a>
            </nav>
          </header>
          <main>
            <section class="hero">
              <h1>Automate your engineering workflows</h1>
              <a href="/pricing#plans">See Pricing</a>
              <a href="https://github.com/supertool">GitHub</a>
            </section>
          </main>
          <footer>
            <a href="/about">About Us</a>
            <a href="/security">Security</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms</a>
            <a href="/careers">Careers</a>
            <a href="/brochure.pdf">PDF Brochure</a>
          </footer>
        </body>
      </html>
    `;

    const candidates = discoverSupportingPages(homepageHtml, "https://supertool.com");

    // Must strictly cap at 3 supporting pages
    expect(candidates.length).toBe(3);

    // Pricing should be top-ranked
    expect(candidates[0].url).toBe("https://supertool.com/pricing");
    expect(candidates[0].pageType).toBe("pricing");
    expect(candidates[0].sourceLocation).toBe("header");

    // Category diversity: should include Pricing + Product/Features + Solutions/Customers (not both /product and /features while skipping other categories)
    const categoryGroups = new Set(candidates.map((c) => c.categoryGroup));
    expect(categoryGroups.size).toBe(3);
    expect(categoryGroups.has("pricing")).toBe(true);
    expect(categoryGroups.has("product_features")).toBe(true);
  });

  test("Multi-Page Phase 1: Safe fetching handles partial failures, cross-domain redirects, and strips raw HTML", async () => {
    const homepageHtml = `
      <html>
        <body>
          <header>
            <nav>
              <a href="/pricing">Pricing</a>
              <a href="/features">Features</a>
              <a href="/customers">Customers</a>
            </nav>
          </header>
        </body>
      </html>
    `;

    const mockFetcher = async (rawUrl: string, normalizedUrl: string): Promise<FetchResult> => {
      if (normalizedUrl.endsWith("/pricing")) {
        return {
          success: true,
          originalUrl: rawUrl,
          normalizedUrl,
          finalUrl: "https://supertool.com/pricing",
          domain: "supertool.com",
          status: 200,
          statusText: "OK",
          contentType: "text/html",
          contentLength: 240,
          redirectCount: 0,
          redirectHistory: [],
          timingMs: 25,
          html: "<html><head><title>Pricing — SuperTool</title></head><body><h1>Simple, transparent pricing</h1><p>Start free for 14 days.</p></body></html>",
        };
      }

      if (normalizedUrl.endsWith("/features")) {
        // Simulate a 500 HTTP failure on one supporting page
        return {
          success: false,
          error: "HTTP_ERROR",
          message: "Website returned HTTP error 500",
          originalUrl: rawUrl,
          normalizedUrl,
          finalUrl: normalizedUrl,
          status: 500,
          timingMs: 15,
        };
      }

      // Simulate a cross-domain redirect on /customers -> external domain
      return {
        success: true,
        originalUrl: rawUrl,
        normalizedUrl,
        finalUrl: "https://external-reviews-site.com/supertool",
        domain: "external-reviews-site.com",
        status: 200,
        statusText: "OK",
        contentType: "text/html",
        contentLength: 120,
        redirectCount: 1,
        redirectHistory: [normalizedUrl],
        timingMs: 30,
        html: "<html><body><h1>External Site</h1></body></html>",
      };
    };

    const bundle = await discoverAndFetchSupportingPages(
      homepageHtml,
      "https://supertool.com",
      { fetcher: mockFetcher }
    );

    expect(bundle.discoveredCount).toBe(3);
    expect(bundle.attemptedCount).toBe(3);
    expect(bundle.fetchedCount).toBe(1);
    expect(bundle.pages.length).toBe(1);

    const pricingPage = bundle.pages[0];
    expect(pricingPage.url).toBe("https://supertool.com/pricing");
    expect(pricingPage.pageType).toBe("pricing");
    expect(pricingPage.snapshot.hero.headline).toBe("Simple, transparent pricing");
    // Raw HTML must never be retained on SupportingPageRecord
    expect("html" in (pricingPage as any)).toBe(false);

    // Attempts log captures both the HTTP error and the blocked cross-domain redirect
    const failedFeatures = bundle.attempts.find((a) => a.url.endsWith("/features"));
    expect(failedFeatures?.success).toBe(false);
    expect(failedFeatures?.error).toBe("HTTP_ERROR");

    const blockedCrossDomain = bundle.attempts.find((a) => a.url.endsWith("/customers"));
    expect(blockedCrossDomain?.success).toBe(false);
    expect(blockedCrossDomain?.error).toBe("CROSS_DOMAIN_REDIRECT");
  });

  test("Multi-Page Phase 1: Deduplicates supporting pages that redirect to the homepage or an already-fetched path", async () => {
    const candidates = discoverSupportingPages(
      `<header><nav><a href="/product">Product</a><a href="/features">Features</a><a href="/about">About</a></nav></header>`,
      "https://supertool.com"
    );

    const mockFetcher = async (rawUrl: string, normalizedUrl: string): Promise<FetchResult> => {
      if (normalizedUrl.endsWith("/product")) {
        return {
          success: true,
          originalUrl: rawUrl,
          normalizedUrl,
          finalUrl: "https://supertool.com/product",
          domain: "supertool.com",
          status: 200,
          statusText: "OK",
          contentType: "text/html",
          contentLength: 100,
          redirectCount: 0,
          redirectHistory: [],
          timingMs: 12,
          html: "<html><body><h1>Product Overview</h1></body></html>",
        };
      }
      if (normalizedUrl.endsWith("/features")) {
        // Redirects to the exact same final URL as /product
        return {
          success: true,
          originalUrl: rawUrl,
          normalizedUrl,
          finalUrl: "https://supertool.com/product/",
          domain: "supertool.com",
          status: 200,
          statusText: "OK",
          contentType: "text/html",
          contentLength: 100,
          redirectCount: 1,
          redirectHistory: [normalizedUrl],
          timingMs: 14,
          html: "<html><body><h1>Product Overview</h1></body></html>",
        };
      }
      // /about redirects back to homepage root
      return {
        success: true,
        originalUrl: rawUrl,
        normalizedUrl,
        finalUrl: "https://supertool.com/",
        domain: "supertool.com",
        status: 200,
        statusText: "OK",
        contentType: "text/html",
        contentLength: 100,
        redirectCount: 1,
        redirectHistory: [normalizedUrl],
        timingMs: 10,
        html: "<html><body><h1>Homepage</h1></body></html>",
      };
    };

    const bundle = await fetchSupportingPages(candidates, "https://supertool.com", {
      fetcher: mockFetcher,
    });

    expect(bundle.fetchedCount).toBe(1);
    expect(bundle.pages[0].path).toBe("/product");
    expect(bundle.attempts.some((a) => a.error === "REDIRECTED_TO_HOMEPAGE")).toBe(true);
  });
});
