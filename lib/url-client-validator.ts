/**
 * Client-safe URL Validator & Normalizer
 * Pure TypeScript with no Node.js built-in dependencies (no node:dns, etc.)
 * Can be safely imported in both client components and server code.
 */

export interface ClientUrlValidationResult {
  isValid: boolean;
  status: "empty" | "valid" | "invalid";
  error?: "INVALID_URL";
  message?: string;
  normalizedUrl?: string;
  domain?: string;
}

/**
 * Helper to check if a 4-octet IPv4 tuple belongs to a private, loopback, or reserved range.
 */
function isPrivateIpv4Octets(a: number, b: number, c: number, d: number): boolean {
  if (
    Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d) ||
    a < 0 || a > 255 || b < 0 || b > 255 || c < 0 || c > 255 || d < 0 || d > 255
  ) {
    return true;
  }

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 & 192.0.2.0/24 (IETF Protocol Assignments & TEST-NET-1)
  if (a === 192 && b === 0) return true;
  // 192.88.99.0/24 (6to4 Relay Anycast)
  if (a === 192 && b === 88 && c === 99) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved / Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Expands an IPv6 string into 8 16-bit hextet numbers (0..0xffff), or returns null if invalid.
 */
function parseIpv6Hextets(ipv6: string): number[] | null {
  // Handle embedded dotted-quad IPv4 at the end of IPv6 (e.g. ::ffff:127.0.0.1)
  let working = ipv6;
  const lastColon = working.lastIndexOf(":");
  if (lastColon !== -1 && working.substring(lastColon + 1).includes(".")) {
    const ipv4Part = working.substring(lastColon + 1);
    const octets = ipv4Part.split(".").map((n) => parseInt(n, 10));
    if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
      return null;
    }
    const highHex = ((octets[0] << 8) | octets[1]).toString(16);
    const lowHex = ((octets[2] << 8) | octets[3]).toString(16);
    working = `${working.substring(0, lastColon)}:${highHex}:${lowHex}`;
  }

  const doubleColonParts = working.split("::");
  if (doubleColonParts.length > 2) return null;

  if (doubleColonParts.length === 2) {
    const left = doubleColonParts[0] ? doubleColonParts[0].split(":") : [];
    const right = doubleColonParts[1] ? doubleColonParts[1].split(":") : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    const expanded = [...left, ...Array(missing).fill("0"), ...right];
    if (expanded.length !== 8) return null;
    const nums = expanded.map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN));
    return nums.some((n) => Number.isNaN(n)) ? null : nums;
  }

  const parts = working.split(":");
  if (parts.length !== 8) return null;
  const nums = parts.map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN));
  return nums.some((n) => Number.isNaN(n)) ? null : nums;
}

/**
 * Checks if an IP address string belongs to a private, loopback, or reserved network range.
 */
export function isPrivateIpAddress(ip: string): boolean {
  let cleanIp = ip.trim().toLowerCase();
  if (cleanIp.startsWith("[") && cleanIp.endsWith("]")) {
    cleanIp = cleanIp.slice(1, -1);
  }
  // Strip IPv6 zone index if present (e.g. %eth0 or %25eth0)
  const zoneIdx = cleanIp.indexOf("%");
  if (zoneIdx !== -1) {
    cleanIp = cleanIp.substring(0, zoneIdx);
  }

  // IPv4 checks
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIp)) {
    const parts = cleanIp.split(".").map((num) => parseInt(num, 10));
    return isPrivateIpv4Octets(parts[0], parts[1], parts[2], parts[3]);
  }

  // IPv6 checks
  if (cleanIp.includes(":")) {
    const hextets = parseIpv6Hextets(cleanIp);
    if (!hextets) {
      // Malformed IPv6 literal is treated as unsafe
      return true;
    }

    const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets;

    // Unspecified ::/128 or Loopback ::1/128
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && (h7 === 0 || h7 === 1)) {
      return true;
    }

    // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && (h5 === 0xffff || h5 === 0)) {
      const a = (h6 >> 8) & 0xff;
      const b = h6 & 0xff;
      const c = (h7 >> 8) & 0xff;
      const d = h7 & 0xff;
      return isPrivateIpv4Octets(a, b, c, d);
    }

    // IPv4-translated ::ffff:0:0:0/96 (RFC 2765)
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0xffff && h5 === 0) {
      const a = (h6 >> 8) & 0xff;
      const b = h6 & 0xff;
      const c = (h7 >> 8) & 0xff;
      const d = h7 & 0xff;
      return isPrivateIpv4Octets(a, b, c, d);
    }

    // NAT64 Well-Known Prefix 64:ff9b::/96 or 64:ff9b:1::/48
    if (h0 === 0x0064 && h1 === 0xff9b) {
      const a = (h6 >> 8) & 0xff;
      const b = h6 & 0xff;
      const c = (h7 >> 8) & 0xff;
      const d = h7 & 0xff;
      return isPrivateIpv4Octets(a, b, c, d);
    }

    // 6to4 2002::/16 (embeds IPv4 in h1 and h2)
    if (h0 === 0x2002) {
      const a = (h1 >> 8) & 0xff;
      const b = h1 & 0xff;
      const c = (h2 >> 8) & 0xff;
      const d = h2 & 0xff;
      return isPrivateIpv4Octets(a, b, c, d);
    }

    // Teredo 2001:0000::/32
    if (h0 === 0x2001 && h1 === 0x0000) {
      return true;
    }

    // Benchmarking 2001:0002::/48
    if (h0 === 0x2001 && h1 === 0x0002 && h2 === 0x0000) {
      return true;
    }

    // Documentation 2001:db8::/32
    if (h0 === 0x2001 && h1 === 0x0db8) {
      return true;
    }

    // Discard-Only 0100::/64
    if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) {
      return true;
    }

    // Unique Local fc00::/7 (fc00..fdff)
    if ((h0 & 0xfe00) === 0xfc00) {
      return true;
    }

    // Link-Local fe80::/10 (fe80..febf) & deprecated Site-Local fec0::/10 (fec0..feff)
    if ((h0 & 0xffc0) === 0xfe80 || (h0 & 0xffc0) === 0xfec0) {
      return true;
    }

    // Multicast ff00::/8
    if ((h0 & 0xff00) === 0xff00) {
      return true;
    }

    return false;
  }

  return false;
}

/**
 * Normalizes user input into a canonical HTTP/HTTPS URL
 */
export function normalizeClientUrl(inputUrl: string): { normalizedUrl: string; domain: string } {
  let cleaned = inputUrl.trim();

  // Strip leading @ or mailto: if any
  if (cleaned.startsWith("@")) {
    cleaned = cleaned.substring(1);
  }

  // Automatically prepend https:// if protocol is missing
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  const parsed = new URL(cleaned);
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();

  const domain = parsed.hostname.replace(/^www\./, "");
  return {
    normalizedUrl: parsed.href,
    domain,
  };
}

/**
 * Validates URL string on the client or server.
 * Returns status: "empty" | "valid" | "invalid"
 */
export function validateClientUrl(rawUrl: string | null | undefined): ClientUrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      isValid: false,
      status: "empty",
      originalUrl: "",
    } as any;
  }

  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return {
      isValid: false,
      status: "empty",
    };
  }

  // Reject excessively long URLs (> 2048 chars) to prevent parser/regex DoS
  if (trimmed.length > 2048) {
    return {
      isValid: false,
      status: "invalid",
      error: "INVALID_URL",
      message: "URL exceeds maximum allowed length",
    };
  }

  // Reject spaces or invalid control characters
  if (/[\s\x00-\x1f\x7f]/.test(trimmed)) {
    return {
      isValid: false,
      status: "invalid",
      error: "INVALID_URL",
      message: "URL cannot contain spaces or control characters",
    };
  }

  // Reject unsupported protocols
  if (/^(javascript|data|file|ftp|gopher|ws|wss|about|mailto|tel|blob):/i.test(trimmed)) {
    return {
      isValid: false,
      status: "invalid",
      error: "INVALID_URL",
      message: "Only HTTP and HTTPS protocols are supported",
    };
  }

  // Reject trailing dots or incomplete domain syntax (e.g. "stripe.", "example..com")
  if (trimmed.endsWith(".") || trimmed.endsWith(":") || trimmed.includes("..")) {
    return {
      isValid: false,
      status: "invalid",
      error: "INVALID_URL",
      message: "Incomplete domain name or invalid punctuation",
    };
  }

  // Must contain alphanumeric characters
  if (!/[a-z0-9]/i.test(trimmed)) {
    return {
      isValid: false,
      status: "invalid",
      error: "INVALID_URL",
      message: "Please enter a valid website domain",
    };
  }

  try {
    const { normalizedUrl, domain } = normalizeClientUrl(trimmed);
    const parsed = new URL(normalizedUrl);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        isValid: false,
        status: "invalid",
        error: "INVALID_URL",
        message: "Only HTTP and HTTPS protocols are supported",
      };
    }

    // Reject embedded credentials (user:pass@host) to prevent authority confusion SSRF
    if (parsed.username || parsed.password) {
      return {
        isValid: false,
        status: "invalid",
        error: "INVALID_URL",
        message: "URLs containing embedded credentials are not permitted",
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (!hostname || hostname.length > 253) {
      return {
        isValid: false,
        status: "invalid",
        error: "INVALID_URL",
        message: "Invalid domain length",
      };
    }

    // Reject plain text without dots (e.g. "hello", "google"), unless IPv6 literal
    if (!hostname.includes(".") && !hostname.includes(":")) {
      return {
        isValid: false,
        status: "invalid",
        error: "INVALID_URL",
        message: "Please include a top-level domain (e.g. yourproduct.com)",
      };
    }

    // Reject localhost, cloud metadata, and internal/reserved suffixes
    if (
      hostname === "localhost" ||
      hostname === "metadata" ||
      hostname === "metadata.goog" ||
      hostname === "metadata.google.internal" ||
      hostname === "instance-data" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".lan") ||
      hostname.endsWith(".home") ||
      hostname.endsWith(".corp") ||
      hostname.endsWith(".localdomain") ||
      hostname.endsWith(".invalid") ||
      hostname.endsWith(".test") ||
      hostname.endsWith(".example")
    ) {
      return {
        isValid: false,
        status: "invalid",
        error: "INVALID_URL",
        message: "Local and reserved domains are not permitted",
      };
    }

    // IP address validation
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
    if (isIpAddress) {
      if (isPrivateIpAddress(hostname)) {
        return {
          isValid: false,
          status: "invalid",
          error: "INVALID_URL",
          message: "Private or internal IP addresses are not permitted",
        };
      }
    } else {
      // Standard domain syntax: labels separated by dot, valid TLD (at least 2 letters)
      const hostnameRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
      if (!hostnameRegex.test(hostname)) {
        return {
          isValid: false,
          status: "invalid",
          error: "INVALID_URL",
          message: "Invalid domain structure or top-level domain (e.g. .com, .io)",
        };
      }
    }

    return {
      isValid: true,
      status: "valid",
      normalizedUrl: parsed.href,
      domain,
    };
  } catch {
    return {
      isValid: false,
      status: "invalid",
      error: "INVALID_URL",
      message: "Invalid URL structure",
    };
  }
}
