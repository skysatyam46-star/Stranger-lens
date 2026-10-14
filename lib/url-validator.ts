import dns from "node:dns";
import {
  validateClientUrl,
  normalizeClientUrl,
  isPrivateIpAddress,
} from "./url-client-validator";

export interface UrlValidationResult {
  isValid: boolean;
  error?: "INVALID_URL" | "SSRF_BLOCKED";
  message?: string;
  originalUrl: string;
  normalizedUrl?: string;
  domain?: string;
}

/**
 * Normalizes an input URL string (e.g. "example.com" -> "https://example.com")
 */
export function normalizeUrl(inputUrl: string): { normalizedUrl: string; domain: string } {
  return normalizeClientUrl(inputUrl);
}

/**
 * Validates syntax, structure, protocol, and domain format of a given URL string.
 * Strictly aligned with client-side live validation.
 */
export function validateUrl(rawUrl: string | null | undefined): UrlValidationResult {
  const trimmed = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!trimmed) {
    return {
      isValid: false,
      error: "INVALID_URL",
      message: "URL string cannot be empty",
      originalUrl: trimmed,
    };
  }

  const result = validateClientUrl(trimmed);
  if (!result.isValid) {
    return {
      isValid: false,
      error: "INVALID_URL",
      message: result.message || "Invalid domain structure or top-level domain (TLD)",
      originalUrl: trimmed,
    };
  }

  return {
    isValid: true,
    originalUrl: trimmed,
    normalizedUrl: result.normalizedUrl,
    domain: result.domain,
  };
}

/**
 * Checks if an IP address string belongs to a private, loopback, or reserved network range.
 */
export function isPrivateIp(ip: string): boolean {
  return isPrivateIpAddress(ip);
}

/**
 * Validates a URL against Server-Side Request Forgery (SSRF) vulnerabilities.
 * Checks protocol, reserved hostnames, private IP literals, and performs DNS resolution to verify target IPs.
 */
export async function checkSsrf(
  urlStr: string
): Promise<{ isSafe: boolean; isDnsFailure?: boolean; reason?: string }> {
  try {
    if (!urlStr || typeof urlStr !== "string" || urlStr.length > 2048) {
      return {
        isSafe: false,
        reason: "Invalid or excessively long URL",
      };
    }

    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        isSafe: false,
        reason: `Unsupported URL protocol '${parsed.protocol}' is prohibited`,
      };
    }

    if (parsed.username || parsed.password) {
      return {
        isSafe: false,
        reason: "URLs containing embedded credentials are prohibited",
      };
    }

    const hostname = parsed.hostname.toLowerCase();
    const unbracketedHost =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;

    if (!unbracketedHost) {
      return {
        isSafe: false,
        reason: "Missing hostname in URL",
      };
    }

    // Check blocked domain suffixes / internal & cloud metadata hostnames
    if (
      unbracketedHost === "localhost" ||
      unbracketedHost === "metadata" ||
      unbracketedHost === "metadata.goog" ||
      unbracketedHost === "metadata.google.internal" ||
      unbracketedHost === "instance-data" ||
      unbracketedHost.endsWith(".localhost") ||
      unbracketedHost.endsWith(".local") ||
      unbracketedHost.endsWith(".internal") ||
      unbracketedHost.endsWith(".lan") ||
      unbracketedHost.endsWith(".home") ||
      unbracketedHost.endsWith(".corp") ||
      unbracketedHost.endsWith(".localdomain") ||
      unbracketedHost.endsWith(".invalid") ||
      unbracketedHost.endsWith(".test") ||
      unbracketedHost.endsWith(".example")
    ) {
      return {
        isSafe: false,
        reason: `Access to internal or restricted domain '${hostname}' is prohibited`,
      };
    }

    // If hostname is a direct IPv4 or IPv6 address literal
    const isIpLiteral =
      /^(\d{1,3}\.){3}\d{1,3}$/.test(unbracketedHost) || unbracketedHost.includes(":");
    if (isIpLiteral) {
      if (isPrivateIp(unbracketedHost)) {
        return {
          isSafe: false,
          reason: `Access to private IP address '${hostname}' is prohibited`,
        };
      }
      return { isSafe: true };
    }

    // DNS Resolution check to prevent DNS rebinding / internal resolution & verify domain existence
    try {
      const addresses = await dns.promises.lookup(unbracketedHost, { all: true });
      if (!addresses || addresses.length === 0) {
        return {
          isSafe: false,
          isDnsFailure: true,
          reason: `Domain '${hostname}' resolved to no addresses. Please verify the website URL.`,
        };
      }
      for (const record of addresses) {
        if (isPrivateIp(record.address)) {
          return {
            isSafe: false,
            reason: `Hostname '${hostname}' resolves to private IP address (${record.address})`,
          };
        }
      }
    } catch (dnsErr: any) {
      return {
        isSafe: false,
        isDnsFailure: true,
        reason: `Domain '${hostname}' does not exist or DNS lookup failed. Please verify the website URL.`,
      };
    }

    return { isSafe: true };
  } catch (err) {
    return {
      isSafe: false,
      reason: err instanceof Error ? err.message : "Failed to parse URL for SSRF check",
    };
  }
}

