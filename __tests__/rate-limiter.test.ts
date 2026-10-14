import { describe, test, expect } from "./test-harness";
import {
  getClientIp,
  checkAndAcquireRateLimit,
  releaseConcurrencySlot,
  _resetRateLimiterForTesting,
} from "../server/security/rateLimiter";
import { POST as verifyRoute } from "../app/api/check/verify/route";
import { POST as checkRoute } from "../app/api/check/route";
import { NextRequest } from "next/server";

describe("Rate Limiter & Concurrency Enforcement Tests", () => {
  test("Client IP extraction: reads rightmost IP from X-Forwarded-For to prevent leftmost spoofing", () => {
    // Single IP
    const req1 = new Request("http://localhost:3000/api/check", {
      headers: { "x-forwarded-for": "203.0.113.195" },
    });
    expect(getClientIp(req1)).toBe("203.0.113.195");

    // Multi-IP chain: leftmost is spoofed client value, rightmost is appended by trusted edge proxy
    const req2 = new Request("http://localhost:3000/api/check", {
      headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1, 203.0.113.50" },
    });
    expect(getClientIp(req2)).toBe("203.0.113.50");
  });

  test("Client IP extraction: falls back to X-Real-IP, CF-Connecting-IP, or unknown-client", () => {
    const reqRealIp = new Request("http://localhost:3000/api/check", {
      headers: { "x-real-ip": "198.51.100.42" },
    });
    expect(getClientIp(reqRealIp)).toBe("198.51.100.42");

    const reqCf = new Request("http://localhost:3000/api/check", {
      headers: { "cf-connecting-ip": "198.51.100.99" },
    });
    expect(getClientIp(reqCf)).toBe("198.51.100.99");

    const reqEmpty = new Request("http://localhost:3000/api/check");
    expect(getClientIp(reqEmpty)).toBe("unknown-client");
  });

  test("Rate limiting: allows requests within configured threshold and tracks count", () => {
    _resetRateLimiterForTesting();
    const testIp = "192.0.2.1";

    for (let i = 1; i <= 5; i++) {
      const result = checkAndAcquireRateLimit(testIp, {
        scope: "test",
        maxPerMinute: 5,
        maxConcurrent: 10,
      });
      expect(result.allowed).toBe(true);
      releaseConcurrencySlot(testIp, "test");
    }
  });

  test("Rate limiting: rejects request exceeding maxPerMinute with 429 and Retry-After", () => {
    _resetRateLimiterForTesting();
    const testIp = "192.0.2.2";

    // Consume all 3 available tokens
    for (let i = 1; i <= 3; i++) {
      const res = checkAndAcquireRateLimit(testIp, {
        scope: "test-limit",
        maxPerMinute: 3,
        maxConcurrent: 10,
      });
      expect(res.allowed).toBe(true);
      releaseConcurrencySlot(testIp, "test-limit");
    }

    // 4th request must be rejected
    const blockedRes = checkAndAcquireRateLimit(testIp, {
      scope: "test-limit",
      maxPerMinute: 3,
      maxConcurrent: 10,
    });
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.error).toBe("RATE_LIMITED");
    expect(blockedRes.retryAfterSeconds).toBeDefined();
    expect(blockedRes.retryAfterSeconds! > 0).toBe(true);
  });

  test("Concurrency limit: rejects request when active jobs reach maxConcurrent", () => {
    _resetRateLimiterForTesting();
    const testIp = "192.0.2.3";

    // Acquire slot 1
    const res1 = checkAndAcquireRateLimit(testIp, {
      scope: "test-conc",
      maxPerMinute: 10,
      maxConcurrent: 2,
    });
    expect(res1.allowed).toBe(true);

    // Acquire slot 2
    const res2 = checkAndAcquireRateLimit(testIp, {
      scope: "test-conc",
      maxPerMinute: 10,
      maxConcurrent: 2,
    });
    expect(res2.allowed).toBe(true);

    // 3rd concurrent request must be rejected
    const res3 = checkAndAcquireRateLimit(testIp, {
      scope: "test-conc",
      maxPerMinute: 10,
      maxConcurrent: 2,
    });
    expect(res3.allowed).toBe(false);
    expect(res3.status).toBe(429);
    expect(res3.error).toBe("CONCURRENCY_LIMITED");

    // Clean up acquired slots
    releaseConcurrencySlot(testIp, "test-conc");
    releaseConcurrencySlot(testIp, "test-conc");
  });

  test("Concurrency safety: releaseConcurrencySlot re-enables subsequent requests", () => {
    _resetRateLimiterForTesting();
    const testIp = "192.0.2.4";

    const res1 = checkAndAcquireRateLimit(testIp, {
      scope: "test-release",
      maxPerMinute: 10,
      maxConcurrent: 1,
    });
    expect(res1.allowed).toBe(true);

    // Concurrency is full
    const blocked = checkAndAcquireRateLimit(testIp, {
      scope: "test-release",
      maxPerMinute: 10,
      maxConcurrent: 1,
    });
    expect(blocked.allowed).toBe(false);

    // Release the active slot
    releaseConcurrencySlot(testIp, "test-release");

    // Subsequent request is now permitted
    const res2 = checkAndAcquireRateLimit(testIp, {
      scope: "test-release",
      maxPerMinute: 10,
      maxConcurrent: 1,
    });
    expect(res2.allowed).toBe(true);
    releaseConcurrencySlot(testIp, "test-release");
  });

  test("Route Integration: POST /api/check/verify returns 429 when rate limit exceeded", async () => {
    _resetRateLimiterForTesting();
    const clientIp = "198.51.100.88";

    // Exhaust verify quota (default 30) by calling helper directly or dispatching verify requests
    for (let i = 0; i < 30; i++) {
      checkAndAcquireRateLimit(clientIp, {
        scope: "verify",
        maxPerMinute: 30,
        maxConcurrent: 4,
      });
      releaseConcurrencySlot(clientIp, "verify");
    }

    const req = new NextRequest("http://localhost:3000/api/check/verify", {
      method: "POST",
      headers: {
        "x-forwarded-for": clientIp,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    const res = await verifyRoute(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("RATE_LIMITED");
    expect(res.headers.get("retry-after")).toBeDefined();
  });

  test("Route Integration: Malformed JSON body returns 400 and releases concurrency slot", async () => {
    _resetRateLimiterForTesting();
    const clientIp = "198.51.100.99";

    const badReq = new NextRequest("http://localhost:3000/api/check", {
      method: "POST",
      headers: {
        "x-forwarded-for": clientIp,
        "content-type": "application/json",
      },
      body: "INVALID_JSON_BODY{{{",
    });

    const res = await checkRoute(badReq);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_URL");

    // Ensure slot was released in finally: another request must be allowed to acquire concurrency
    const checkSlot = checkAndAcquireRateLimit(clientIp, {
      scope: "check",
      maxPerMinute: 15,
      maxConcurrent: 2,
    });
    expect(checkSlot.allowed).toBe(true);
    releaseConcurrencySlot(clientIp, "check");
  });
});
