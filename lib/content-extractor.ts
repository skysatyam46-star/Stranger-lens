import * as cheerio from "cheerio";
import { SERVER_LIMITS } from "@/server/config/limits";

export interface CTAItem {
  text: string;
  href?: string;
  type: "primary" | "secondary" | "utility";
  element: string;
  location: "header" | "hero" | "body" | "footer" | "sticky_banner";
  ariaLabel?: string;
}

export interface WebsiteSnapshot {
  meta: {
    title: string;
    description: string;
    canonicalUrl?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    favicon?: string;
    language?: string;
  };
  navigation: {
    brandName?: string;
    logoAlt?: string;
    primaryNavLinks: Array<{ text: string; href: string }>;
  };
  hero: {
    headline: string;
    subheadline: string;
    primaryCta?: CTAItem;
    secondaryCta?: CTAItem;
    media?: Array<{ type: "image" | "video"; src: string; alt?: string }>;
  };
  ctas: CTAItem[];
  valueProps: {
    headings: Array<{ level: number; text: string }>;
    featureCards: Array<{ title: string; description: string }>;
    pricingSignals: {
      hasPricingPageLink: boolean;
      plans: Array<{ name?: string; price?: string; period?: string }>;
      mentionsFreeTrial: boolean;
      mentionsGuarantee: boolean;
    };
  };
  trustSignals: {
    socialProofHeadings: string[];
    statsAndMetrics: string[];
    testimonials: Array<{ quote: string; author?: string; company?: string }>;
    badgesAndCertifications: string[];
    customerLogosAlt: string[];
  };
  bodySections: Array<{
    id: string;
    typeHint: "hero" | "features" | "social_proof" | "pricing" | "faq" | "footer" | "content_block";
    heading?: string;
    textSummary: string;
    bulletPoints: string[];
  }>;
  forms: Array<{
    typeHint: "email_capture" | "signup" | "contact" | "login" | "search" | "generic";
    fields: Array<{ label?: string; placeholder?: string; type: string }>;
    submitLabel?: string;
  }>;
  stats: {
    rawHtmlLength: number;
    cleanedTextLength: number;
    totalHeadings: number;
    totalLinks: number;
    totalImages: number;
  };
}

export interface ExtractOptions {
  baseUrl?: string;
  maxHtmlChars?: number;
}

/**
 * Normalizes relative URLs into absolute URLs using the baseUrl if provided.
 */
function resolveUrl(href: string | undefined, baseUrl?: string): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("javascript:")) {
    return trimmed;
  }
  if (!baseUrl) return trimmed;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return trimmed;
  }
}

/**
 * Cleans whitespace and normalizes text content.
 */
function cleanText(str: string | undefined): string {
  if (!str) return "";
  return str.replace(/\s+/g, " ").trim();
}

const PURE_NAV_OR_UTILITY_LABELS = new Set([
  "faq",
  "faqs",
  "frequently asked questions",
  "about",
  "about us",
  "our story",
  "team",
  "careers",
  "jobs",
  "press",
  "media",
  "blog",
  "news",
  "articles",
  "docs",
  "documentation",
  "api",
  "guides",
  "resources",
  "community",
  "forum",
  "status",
  "system status",
  "security",
  "privacy",
  "privacy policy",
  "terms",
  "terms of service",
  "terms & conditions",
  "legal",
  "cookie policy",
  "cookies",
  "contact",
  "contact us",
  "support",
  "help",
  "help center",
  "log in",
  "login",
  "sign in",
  "signin",
  "home",
  "menu",
  "open menu",
  "close menu",
  "toggle menu",
  "toggle theme",
  "dark mode",
  "light mode",
  "close",
  "skip to content",
  "back",
  "next",
  "previous",
  "search",
  "features",
  "how it works",
  "testimonials",
  "reviews",
  "customers",
  "solutions",
  "use cases",
]);

const UTILITY_SUBSTRING_KEYWORDS = [
  "login",
  "log in",
  "sign in",
  "contact us",
  "privacy policy",
  "terms of service",
  "cookie policy",
  "help center",
  "toggle menu",
  "skip to",
  "frequently asked",
];

const PRIMARY_CONVERSION_KEYWORDS = [
  "get started",
  "start free",
  "start a free",
  "start trial",
  "start now",
  "try free",
  "try for free",
  "try it",
  "try now",
  "book demo",
  "book a demo",
  "request demo",
  "schedule demo",
  "buy now",
  "order now",
  "shop now",
  "sign up",
  "register now",
  "create account",
  "claim",
  "join",
  "get access",
  "get early access",
  "get valuecheck",
  "find my",
  "check my",
  "see my",
  "get my",
  "calculate",
  "analyze",
  "scan",
  "generate",
  "discover your",
  "discover my",
  "check your",
  "test your",
  "run check",
  "run analysis",
  "get report",
  "free report",
  "unlock",
  "launch",
];

/**
 * Determines whether a label or href represents a navigation, informational,
 * FAQ, or utility control rather than a primary conversion CTA.
 */
export function isNavigationOrUtilityCtaLabel(
  text: string | undefined,
  rawHref?: string
): boolean {
  if (!text) return true;
  const cleaned = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!cleaned || cleaned.length < 2) return true;

  // Reject pure symbols, numbers, or question strings (e.g., FAQ accordion headings)
  if (/^[\d\W]+$/.test(cleaned) || cleaned.endsWith("?")) {
    return true;
  }

  if (PURE_NAV_OR_UTILITY_LABELS.has(cleaned)) {
    return true;
  }

  if (UTILITY_SUBSTRING_KEYWORDS.some((kw) => cleaned.includes(kw))) {
    return true;
  }

  if (rawHref) {
    const h = rawHref.trim().toLowerCase();
    if (
      h === "#" ||
      /^#(?:faq|faqs|about|features|how-it-works|testimonials|reviews|footer|contact|team|docs)\b/i.test(
        h
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Main Phase 2 Website Content Extractor.
 * Deterministically parses HTML using Cheerio, strips DOM noise, and builds a
 * structured WebsiteSnapshot for AI Analysis in Phase 3.
 */
export function extractWebsiteSnapshot(
  html: string,
  options: ExtractOptions = {}
): WebsiteSnapshot {
  const rawHtmlLength = html.length;
  const baseUrl = options.baseUrl;

  // Enforce hard character bound before DOM parsing to prevent excessive memory consumption
  const maxHtmlChars = options.maxHtmlChars ?? SERVER_LIMITS.WEBSITE_MAX_HTML_CHARS;
  const boundedHtml = html.length > maxHtmlChars ? html.slice(0, maxHtmlChars) : html;

  // 1. Load Cheerio
  const $ = cheerio.load(boundedHtml);

  // Measure raw elements before DOM noise stripping
  const totalHeadings = $("h1, h2, h3, h4, h5, h6").length;
  const totalLinks = $("a").length;
  const totalImages = $("img").length;

  // 2. Metadata Extraction (before noise stripping to preserve meta tags)
  const lang = $("html").attr("lang") || undefined;
  const rawTitle = $("title").first().text() || $('meta[property="og:title"]').attr("content") || "";
  const title = cleanText(rawTitle);

  const metaDescription =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";
  const description = cleanText(metaDescription);

  const canonicalUrl = resolveUrl($('link[rel="canonical"]').attr("href"), baseUrl);
  const ogTitle = $('meta[property="og:title"]').attr("content") || undefined;
  const ogDescription = $('meta[property="og:description"]').attr("content") || undefined;
  const ogImage = resolveUrl($('meta[property="og:image"]').attr("content"), baseUrl);

  let favicon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href");
  if (favicon) {
    favicon = resolveUrl(favicon, baseUrl);
  }

  // 3. DOM Noise Removal
  // Strip scripts, styles, noscript, svgs, iframes, embeds
  $("script, style, noscript, svg, iframe, object, embed").remove();

  // Strip hidden elements statically detectable
  $('[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"], [aria-hidden="true"]').remove();

  // Remove common non-content noise (cookie notices, chat widgets, popups)
  $(
    '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], ' +
    '[id*="intercom"], [id*="zendesk"], [id*="drift"], [id*="crisp"], ' +
    '[class*="chat-widget"], [class*="popup"], [id*="popup"], [class*="banner-cookie"]'
  ).remove();

  // Calculate cleaned text length
  const cleanedBodyText = cleanText($("body").text());
  const cleanedTextLength = cleanedBodyText.length;

  // 4. Navigation & Header Extraction
  const headerElem = $("header, nav, [role='banner'], .header, .nav, .navbar").first();
  let logoAlt: string | undefined;
  let brandName: string | undefined;

  if (headerElem.length > 0) {
    const logoImg = headerElem.find("img[alt], img[title]").first();
    if (logoImg.length > 0) {
      logoAlt = cleanText(logoImg.attr("alt") || logoImg.attr("title") || "");
    }

    const brandElem = headerElem.find(".logo, .brand, .navbar-brand, h1, span").first();
    if (brandElem.length > 0) {
      brandName = cleanText(brandElem.text());
    }
  }

  if (!brandName && baseUrl) {
    try {
      const urlObj = new URL(baseUrl);
      brandName = urlObj.hostname.replace(/^www\./, "").split(".")[0];
      brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1);
    } catch {
      // ignore
    }
  }

  const primaryNavLinks: Array<{ text: string; href: string }> = [];
  const navLinkSet = new Set<string>();

  const navElements = $("header a, nav a, [role='navigation'] a, .nav a, .navbar a");
  navElements.each((_, el) => {
    const text = cleanText($(el).text());
    const href = resolveUrl($(el).attr("href"), baseUrl);
    if (text && href && text.length < 50 && !navLinkSet.has(href)) {
      navLinkSet.add(href);
      primaryNavLinks.push({ text, href });
    }
  });

  // 5. Identify Hero Container First (so CTA location and hero text share consistent boundaries)
  let heroContainer = $(
    ".hero, #hero, [class*='hero-section'], [class*='hero_section'], .banner, .intro, header + section, main > section:first-of-type"
  ).first();

  const mainFirstH1 = $("main h1, [role='main'] h1, body h1")
    .filter((_, el) => $(el).closest("header, nav, footer, .header, .nav, .footer").length === 0)
    .first();

  if (heroContainer.length === 0 && mainFirstH1.length > 0) {
    const h1Container = mainFirstH1
      .closest("section, article, form, [class*='hero'], [class*='container'], [class*='wrapper'], div")
      .first();
    if (h1Container.length > 0) {
      heroContainer = h1Container as typeof heroContainer;
    }
  } else if (
    heroContainer.length > 0 &&
    mainFirstH1.length > 0 &&
    heroContainer.find("h1").length === 0
  ) {
    // If section:first-of-type was a later section (e.g. #faq) because the hero used a <div> around <h1>
    const h1Container = mainFirstH1
      .closest("section, article, form, [class*='hero'], [class*='container'], [class*='wrapper'], div")
      .first();
    if (h1Container.length > 0) {
      heroContainer = h1Container as typeof heroContainer;
    }
  }

  // 5b. CTA Inventory Extraction
  const ctas: CTAItem[] = [];
  const ctaDedupeSet = new Set<string>();

  const ctaElements = $("a, button, input[type='submit'], input[type='button'], [role='button']");

  ctaElements.each((_, el) => {
    const $el = $(el);
    const text = cleanText($el.text() || $el.attr("value") || $el.attr("aria-label") || "");
    const rawHrefAttr = $el.attr("href");
    const href = resolveUrl(rawHrefAttr, baseUrl);
    const ariaLabel = $el.attr("aria-label") ? cleanText($el.attr("aria-label")) : undefined;
    const tagName = el.tagName.toLowerCase();

    if (!text || text.length > 60) return;

    // Determine Location
    let location: CTAItem["location"] = "body";
    if ($el.closest("header, nav, [role='banner'], [role='navigation'], .header, .nav, .navbar").length > 0) {
      location = "header";
    } else if ($el.closest("footer, [role='contentinfo'], .footer, #footer").length > 0) {
      location = "footer";
    } else if ($el.closest(".sticky, .top-bar, .announcement-bar, .cta-banner").length > 0) {
      location = "sticky_banner";
    } else if (
      $el.closest(".hero, #hero, [class*='hero'], .banner, .intro, header + section").length > 0 ||
      (heroContainer.length > 0 &&
        ($el.closest(heroContainer).length > 0 || heroContainer.find($el).length > 0))
    ) {
      location = "hero";
    }

    // Determine CTA Type
    const lowerText = text.toLowerCase();
    const classAttr = ($el.attr("class") || "").toLowerCase();
    const hasPrimaryClass =
      $el.hasClass("btn-primary") ||
      $el.hasClass("button-primary") ||
      /\b(btn-primary|button-primary|cta-primary|primary-cta|hero-cta)\b/i.test(classAttr);
    const isFormSubmit =
      (tagName === "input" && ($el.attr("type") || "").toLowerCase() === "submit") ||
      (tagName === "button" && ($el.attr("type") || "").toLowerCase() === "submit") ||
      ($el.is("button") && $el.closest("form").length > 0);
    const isUtilityOrNav = isNavigationOrUtilityCtaLabel(text, rawHrefAttr);

    let type: CTAItem["type"] = "secondary";

    if (isUtilityOrNav) {
      type = "utility";
    } else if (
      PRIMARY_CONVERSION_KEYWORDS.some((k) => lowerText.includes(k)) ||
      hasPrimaryClass ||
      isFormSubmit
    ) {
      type = "primary";
    } else if (
      lowerText.includes("learn more") ||
      lowerText.includes("see pricing") ||
      lowerText.includes("view pricing") ||
      lowerText.includes("watch demo") ||
      lowerText.includes("explore") ||
      lowerText.includes("read more") ||
      lowerText.includes("how it works")
    ) {
      type = "secondary";
    } else if (
      (tagName === "button" || $el.attr("role") === "button") &&
      (location === "hero" || location === "body") &&
      $el.closest("#faq, .faq, [class*='faq'], [id*='faq'], footer, header, nav").length === 0
    ) {
      type = "primary";
    } else if (location === "header" || location === "footer") {
      // Plain header/footer links without primary conversion signals are navigation/utility links
      type = "utility";
    }

    const dedupeKey = `${text.toLowerCase()}|${href || ""}|${location}`;
    if (!ctaDedupeSet.has(dedupeKey)) {
      ctaDedupeSet.add(dedupeKey);
      ctas.push({
        text,
        href,
        type,
        element: tagName,
        location,
        ariaLabel,
      });
    }
  });

  // 6. Hero / Above-The-Fold Extraction
  let heroHeadline = "";
  let heroSubheadline = "";

  if (heroContainer.length > 0) {
    const h1InHero = heroContainer.find("h1").first();
    if (h1InHero.length > 0) {
      heroHeadline = cleanText(h1InHero.text());
    }
    const subElem = heroContainer.find("p, h2, .subheadline, .hero-subtitle, .lead").first();
    if (subElem.length > 0) {
      heroSubheadline = cleanText(subElem.text());
    }
  }

  // Fallback for headline if not found in hero container
  if (!heroHeadline) {
    const firstH1 = mainFirstH1.length > 0 ? mainFirstH1 : $("h1").first();
    if (firstH1.length > 0) {
      heroHeadline = cleanText(firstH1.text());
    } else {
      const firstH2 = $("h2").first();
      heroHeadline = firstH2.length > 0 ? cleanText(firstH2.text()) : title;
    }
  }

  if (!heroSubheadline) {
    const firstP = $("main p, p").first();
    if (firstP.length > 0) {
      heroSubheadline = cleanText(firstP.text());
    }
  }

  // Deterministic Primary & Secondary CTA Selection:
  // Prioritize hero conversion CTAs -> main-body conversion CTAs -> sticky banner -> explicit header conversion CTAs.
  // Never promote navigation or utility items (such as "FAQ", "About", "Contact", "Log in") to heroPrimaryCta.
  const heroPrimaryCta =
    ctas.find((c) => c.location === "hero" && c.type === "primary") ||
    ctas.find((c) => c.location === "body" && c.type === "primary") ||
    ctas.find((c) => c.location === "sticky_banner" && c.type === "primary") ||
    ctas.find(
      (c) =>
        c.location === "header" &&
        c.type === "primary" &&
        !isNavigationOrUtilityCtaLabel(c.text, c.href)
    ) ||
    ctas.find(
      (c) =>
        c.location === "hero" &&
        c.type === "secondary" &&
        !isNavigationOrUtilityCtaLabel(c.text, c.href)
    );

  const heroSecondaryCta =
    ctas.find(
      (c) =>
        c.location === "hero" &&
        c.type === "secondary" &&
        c !== heroPrimaryCta &&
        !isNavigationOrUtilityCtaLabel(c.text, c.href)
    ) ||
    ctas.find(
      (c) =>
        c.location === "body" &&
        c.type === "secondary" &&
        c !== heroPrimaryCta &&
        !isNavigationOrUtilityCtaLabel(c.text, c.href)
    );

  // Hero Media
  const heroMedia: Array<{ type: "image" | "video"; src: string; alt?: string }> = [];
  const heroImgs = (heroContainer.length > 0 ? heroContainer : $("main, body")).find("img").slice(0, 3);
  heroImgs.each((_, img) => {
    const src = resolveUrl($(img).attr("src") || $(img).attr("data-src"), baseUrl);
    const alt = cleanText($(img).attr("alt") || "");
    if (src && !src.startsWith("data:")) {
      heroMedia.push({ type: "image", src, alt });
    }
  });

  // 7. Headings & Feature Cards Breakdown
  const headings: Array<{ level: number; text: string }> = [];
  $("h1, h2, h3").each((_, h) => {
    const level = parseInt(h.tagName.substring(1), 10);
    const text = cleanText($(h).text());
    if (text && text.length < 150) {
      headings.push({ level, text });
    }
  });

  const featureCards: Array<{ title: string; description: string }> = [];
  const cardContainers = $(
    ".card, .feature, .feature-card, .grid > div, [class*='feature'], [class*='card']"
  );

  cardContainers.each((_, card) => {
    const $card = $(card);
    const titleElem = $card.find("h2, h3, h4, strong, .title, .card-title").first();
    const descElem = $card.find("p, .description, .card-text").first();

    if (titleElem.length > 0) {
      const cardTitle = cleanText(titleElem.text());
      const cardDesc = descElem.length > 0 ? cleanText(descElem.text()) : "";
      if (cardTitle && cardTitle.length > 3 && cardTitle.length < 100) {
        featureCards.push({ title: cardTitle, description: cardDesc });
      }
    }
  });

  // Limit feature cards to top 10 relevant ones
  const uniqueFeatureCards = featureCards
    .filter((v, i, a) => a.findIndex((t) => t.title === v.title) === i)
    .slice(0, 10);

  // 8. Pricing Signals
  const pageTextLower = cleanedBodyText.toLowerCase();
  const hasPricingPageLink = ctas.some(
    (c) => (c.href && c.href.toLowerCase().includes("pricing")) || c.text.toLowerCase().includes("pricing")
  );

  const mentionsFreeTrial =
    pageTextLower.includes("free trial") ||
    pageTextLower.includes("14-day trial") ||
    pageTextLower.includes("7-day trial") ||
    pageTextLower.includes("try for free");

  const mentionsGuarantee =
    pageTextLower.includes("money-back") ||
    pageTextLower.includes("guarantee") ||
    pageTextLower.includes("risk-free");

  // Extract pricing plans if visible
  const plans: Array<{ name?: string; price?: string; period?: string }> = [];
  const pricingCards = $(".pricing-card, .price-card, [class*='pricing'], [class*='plan']");

  pricingCards.each((_, pCard) => {
    const $p = $(pCard);
    const planName = cleanText($p.find("h2, h3, h4, .plan-name, .title").first().text());
    const priceText = cleanText($p.find(".price, .amount, [class*='price']").first().text());

    if (planName || priceText) {
      let period = "/month";
      if (priceText.includes("/yr") || priceText.includes("year") || priceText.includes("annual")) {
        period = "/year";
      } else if (priceText.toLowerCase().includes("custom") || priceText.toLowerCase().includes("contact")) {
        period = "custom";
      }
      plans.push({ name: planName || "Plan", price: priceText || undefined, period });
    }
  });

  // 9. Trust & Audience Signals
  const socialProofHeadings: string[] = [];
  const statsAndMetrics: string[] = [];
  const testimonials: Array<{ quote: string; author?: string; company?: string }> = [];
  const badgesAndCertifications: string[] = [];
  const customerLogosAlt: string[] = [];

  // Social proof headings
  headings.forEach((h) => {
    const lower = h.text.toLowerCase();
    if (
      lower.includes("trusted by") ||
      lower.includes("used by") ||
      lower.includes("joined by") ||
      lower.includes("companies") ||
      lower.includes("teams") ||
      lower.includes("customers")
    ) {
      socialProofHeadings.push(h.text);
    }
  });

  // Stats & Metrics Regex Matches
  const statRegex = /\b(\d+(?:\.\d+)?%|\$\d+(?:\.\d+)?[kMB]?|\d{1,3}(?:,\d{3})+\+?|\d+\+? (?:users|customers|companies|teams|downloads|active))\b/gi;
  const statMatches = cleanedBodyText.match(statRegex);
  if (statMatches) {
    const uniqueStats = Array.from(new Set(statMatches.map((s) => s.trim()))).slice(0, 8);
    statsAndMetrics.push(...uniqueStats);
  }

  // Testimonials
  $("blockquote, .testimonial, [class*='testimonial'], [class*='review']").each((_, t) => {
    const $t = $(t);
    const quote = cleanText($t.find("p, .quote, .content").first().text() || $t.text());
    const author = cleanText($t.find(".author, .name, cite, strong").first().text());
    const company = cleanText($t.find(".company, .title, .role").first().text());

    if (quote && quote.length > 15 && quote.length < 400) {
      testimonials.push({
        quote,
        author: author || undefined,
        company: company || undefined,
      });
    }
  });

  // Badges & Certifications
  const trustKeywords = ["soc2", "soc 2", "iso 27001", "gdpr", "hipaa", "ssl", "pci-dss", "256-bit"];
  trustKeywords.forEach((kw) => {
    if (pageTextLower.includes(kw)) {
      badgesAndCertifications.push(kw.toUpperCase());
    }
  });

  // Customer Logo Alts
  $("[class*='logo'], [class*='partner'], [class*='client'], .social-proof").find("img").each((_, img) => {
    const alt = cleanText($(img).attr("alt") || "");
    if (alt && alt.length < 50 && !customerLogosAlt.includes(alt)) {
      customerLogosAlt.push(alt);
    }
  });

  // 10. Structured Body Content & Sections
  const bodySections: WebsiteSnapshot["bodySections"] = [];
  let sectionIdx = 0;

  const rawSections = $("main section, body > section, section, article, div[class*='section']");

  rawSections.each((_, sec) => {
    const $sec = $(sec);
    const secHeadingElem = $sec.find("h1, h2, h3").first();
    const secHeading = secHeadingElem.length > 0 ? cleanText(secHeadingElem.text()) : undefined;

    const secText = cleanText($sec.text());
    if (secText.length < 30) return; // Skip tiny empty sections

    const bullets: string[] = [];
    $sec.find("li").each((_, li) => {
      const bText = cleanText($(li).text());
      if (bText && bText.length < 150) {
        bullets.push(bText);
      }
    });

    // Infer Section Type Hint
    let typeHint: WebsiteSnapshot["bodySections"][number]["typeHint"] = "content_block";
    const secLower = (secHeading || "" + " " + $sec.attr("class") || "").toLowerCase();

    if (sectionIdx === 0 || secLower.includes("hero") || secLower.includes("banner")) {
      typeHint = "hero";
    } else if (secLower.includes("feature") || secLower.includes("benefit") || secLower.includes("solution")) {
      typeHint = "features";
    } else if (
      secLower.includes("testimonial") ||
      secLower.includes("social-proof") ||
      secLower.includes("trust") ||
      secLower.includes("customer")
    ) {
      typeHint = "social_proof";
    } else if (secLower.includes("pricing") || secLower.includes("plan")) {
      typeHint = "pricing";
    } else if (secLower.includes("faq") || secLower.includes("question")) {
      typeHint = "faq";
    } else if ($sec.closest("footer, .footer").length > 0 || secLower.includes("footer")) {
      typeHint = "footer";
    }

    sectionIdx++;
    bodySections.push({
      id: `section-${sectionIdx}`,
      typeHint,
      heading: secHeading,
      textSummary: secText.substring(0, 300) + (secText.length > 300 ? "..." : ""),
      bulletPoints: bullets.slice(0, 6),
    });
  });

  // Limit body sections to top 12
  const topBodySections = bodySections.slice(0, 12);

  // 11. Forms & Inputs Identification
  const forms: WebsiteSnapshot["forms"] = [];
  $("form").each((_, f) => {
    const $f = $(f);
    const fields: Array<{ label?: string; placeholder?: string; type: string }> = [];

    $f.find("input, select, textarea").each((_, inp) => {
      const $inp = $(inp);
      const type = $inp.attr("type") || inp.tagName.toLowerCase();
      if (type === "hidden" || type === "submit") return;

      const placeholder = $inp.attr("placeholder") ? cleanText($inp.attr("placeholder")) : undefined;
      let label: string | undefined;

      const id = $inp.attr("id");
      if (id) {
        const labelElem = $(`label[for='${id}']`);
        if (labelElem.length > 0) label = cleanText(labelElem.text());
      }
      if (!label) {
        const parentLabel = $inp.closest("label");
        if (parentLabel.length > 0) label = cleanText(parentLabel.text());
      }

      fields.push({ label, placeholder, type });
    });

    const submitBtn = $f.find("button[type='submit'], input[type='submit'], button").first();
    const submitLabel = submitBtn.length > 0 ? cleanText(submitBtn.text() || submitBtn.attr("value") || "Submit") : undefined;

    // Type Hint Identification
    let typeHint: WebsiteSnapshot["forms"][number]["typeHint"] = "generic";
    const formTextLower = ($f.text() + " " + ($f.attr("action") || "") + " " + ($f.attr("id") || "")).toLowerCase();

    if (fields.some((field) => field.type === "password")) {
      if (formTextLower.includes("sign up") || formTextLower.includes("register")) {
        typeHint = "signup";
      } else {
        typeHint = "login";
      }
    } else if (fields.length === 1 && fields[0].type === "email") {
      typeHint = "email_capture";
    } else if (formTextLower.includes("search") || fields.some((f) => f.type === "search")) {
      typeHint = "search";
    } else if (
      formTextLower.includes("contact") ||
      formTextLower.includes("message") ||
      fields.some((f) => f.type === "textarea")
    ) {
      typeHint = "contact";
    } else if (formTextLower.includes("newsletter") || formTextLower.includes("subscribe") || formTextLower.includes("waitlist")) {
      typeHint = "email_capture";
    }

    forms.push({
      typeHint,
      fields,
      submitLabel,
    });
  });

  // Assemble and return complete WebsiteSnapshot
  return {
    meta: {
      title,
      description,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
      favicon,
      language: lang,
    },
    navigation: {
      brandName,
      logoAlt,
      primaryNavLinks,
    },
    hero: {
      headline: heroHeadline,
      subheadline: heroSubheadline,
      primaryCta: heroPrimaryCta,
      secondaryCta: heroSecondaryCta,
      media: heroMedia,
    },
    ctas,
    valueProps: {
      headings,
      featureCards: uniqueFeatureCards,
      pricingSignals: {
        hasPricingPageLink,
        plans,
        mentionsFreeTrial,
        mentionsGuarantee,
      },
    },
    trustSignals: {
      socialProofHeadings: Array.from(new Set(socialProofHeadings)),
      statsAndMetrics,
      testimonials: testimonials.slice(0, 5),
      badgesAndCertifications: Array.from(new Set(badgesAndCertifications)),
      customerLogosAlt,
    },
    bodySections: topBodySections,
    forms,
    stats: {
      rawHtmlLength,
      cleanedTextLength,
      totalHeadings,
      totalLinks,
      totalImages,
    },
  };
}
