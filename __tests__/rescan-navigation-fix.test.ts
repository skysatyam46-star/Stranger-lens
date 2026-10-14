import { describe, test, expect } from "./test-harness";
import { createScanFlowController } from "../lib/scan-flow-controller";

describe("StrangerLens Rescan & Navigation Fix Test Suite", () => {
  const sampleReportData = {
    score: 82,
    domain: "example.com",
    scoreStatus: "Good",
    verdict: "Strong clarity for first-time visitors.",
    signals: [
      { id: "first-impression", title: "First Impression", score: 85, badgeType: "clear", badgeText: "Clear", description: "Clear opening", icon: "Eye" },
      { id: "audience", title: "Audience", score: 80, badgeType: "clear", badgeText: "Clear", description: "Target clear", icon: "Users" },
      { id: "value", title: "Value", score: 85, badgeType: "clear", badgeText: "Clear", description: "Value proposition clear", icon: "Sparkles" },
      { id: "trust", title: "Trust", score: 75, badgeType: "amber", badgeText: "Needs work", description: "Add social proof", icon: "Shield" },
      { id: "action", title: "Action", score: 85, badgeType: "clear", badgeText: "Clear", description: "Clear CTA", icon: "Zap" },
    ],
  };

  test("Flow 1: Scan -> Results -> Back -> No rescan", async () => {
    let fetchCount = 0;
    const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      fetchCount += 1;
      const urlStr = url.toString();
      if (urlStr.includes("/verify")) {
        return new Response(JSON.stringify({ ok: true, success: true, normalizedUrl: "https://example.com" }), { status: 200 });
      }
      return new Response(JSON.stringify(sampleReportData), { status: 200 });
    };

    const controller = createScanFlowController({ fetchImpl: mockFetch as any });

    // 1. Initial scan
    await controller.startScan("https://example.com");
    expect(controller.getState().currentView).toBe("results");
    expect(controller.getState().analysisData).toBeDefined();
    const fetchCountAfterScan = fetchCount;
    expect(fetchCountAfterScan).toBe(2); // 1 verify + 1 check

    // 2. User navigates Back
    controller.navigateToLanding();
    expect(controller.getState().currentView).toBe("landing");
    expect(controller.getState().isVerifying).toBe(false);
    expect(controller.getState().isPending).toBe(false);

    // Verify absolutely NO rescan occurred
    expect(fetchCount).toBe(fetchCountAfterScan);
  });

  test("Flow 2: Scan -> Results -> New Check -> Clean input screen -> No rescan", async () => {
    let fetchCount = 0;
    const mockFetch = async (url: string | URL | Request): Promise<Response> => {
      fetchCount += 1;
      const urlStr = url.toString();
      if (urlStr.includes("/verify")) {
        return new Response(JSON.stringify({ ok: true, success: true, normalizedUrl: "https://example.com" }), { status: 200 });
      }
      return new Response(JSON.stringify(sampleReportData), { status: 200 });
    };

    const controller = createScanFlowController({ fetchImpl: mockFetch as any });

    // Complete scan
    await controller.startScan("https://example.com");
    expect(controller.getState().currentView).toBe("results");
    const fetchCountAfterScan = fetchCount;

    // User clicks 'New Check'
    controller.resetToLanding(true);
    const state = controller.getState();

    // Must be on landing view with clean input (empty string)
    expect(state.currentView).toBe("landing");
    expect(state.url).toBe("");
    expect(state.submittedUrl).toBe("");
    expect(state.isVerifying).toBe(false);
    expect(state.isPending).toBe(false);
    expect(state.analysisData).toBe(null);

    // Absolutely NO rescan
    expect(fetchCount).toBe(fetchCountAfterScan);
  });

  test("Flow 3: Scan -> Results -> Home/Logo -> No rescan", async () => {
    let fetchCount = 0;
    const mockFetch = async (url: string | URL | Request): Promise<Response> => {
      fetchCount += 1;
      const urlStr = url.toString();
      if (urlStr.includes("/verify")) {
        return new Response(JSON.stringify({ ok: true, success: true, normalizedUrl: "https://example.com" }), { status: 200 });
      }
      return new Response(JSON.stringify(sampleReportData), { status: 200 });
    };

    const controller = createScanFlowController({ fetchImpl: mockFetch as any });

    await controller.startScan("https://example.com");
    expect(controller.getState().currentView).toBe("results");
    const fetchCountAfterScan = fetchCount;

    // User clicks Logo / Home to return to landing page
    controller.navigateToLanding();
    expect(controller.getState().currentView).toBe("landing");
    expect(controller.getState().isVerifying).toBe(false);
    expect(controller.getState().isPending).toBe(false);

    // Absolutely NO rescan
    expect(fetchCount).toBe(fetchCountAfterScan);
  });

  test("Flow 4: Results -> Refresh -> No rescan (session restore)", () => {
    let fetchCount = 0;
    const mockFetch = async (): Promise<Response> => {
      fetchCount += 1;
      return new Response("{}", { status: 200 });
    };

    const controller = createScanFlowController({ fetchImpl: mockFetch as any });

    // Refresh restores session without network calls
    controller.restoreSession("https://example.com", sampleReportData);

    expect(controller.getState().currentView).toBe("results");
    expect(controller.getState().analysisData.score).toBe(82);
    expect(controller.getState().isVerifying).toBe(false);
    expect(controller.getState().isPending).toBe(false);
    expect(fetchCount).toBe(0); // ZERO fetch calls
  });

  test("Flow 5: Results -> Recheck -> Exactly ONE new scan", async () => {
    let fetchCount = 0;
    const mockFetch = async (url: string | URL | Request): Promise<Response> => {
      fetchCount += 1;
      const urlStr = url.toString();
      if (urlStr.includes("/verify")) {
        return new Response(JSON.stringify({ ok: true, success: true, normalizedUrl: "https://example.com" }), { status: 200 });
      }
      return new Response(JSON.stringify(sampleReportData), { status: 200 });
    };

    const controller = createScanFlowController({ fetchImpl: mockFetch as any });

    // 1. Initial scan
    await controller.startScan("https://example.com");
    expect(fetchCount).toBe(2);

    // 2. Explicit Recheck
    await controller.retryScan();
    // Exactly ONE new full scan cycle (1 verify + 1 check = +2)
    expect(fetchCount).toBe(4);
    expect(controller.getState().currentView).toBe("results");
  });

  test("Flow 6: Results -> Back -> Forward -> Restore report without rescan", async () => {
    let fetchCount = 0;
    const mockFetch = async (url: string | URL | Request): Promise<Response> => {
      fetchCount += 1;
      const urlStr = url.toString();
      if (urlStr.includes("/verify")) {
        return new Response(JSON.stringify({ ok: true, success: true, normalizedUrl: "https://example.com" }), { status: 200 });
      }
      return new Response(JSON.stringify(sampleReportData), { status: 200 });
    };

    const controller = createScanFlowController({ fetchImpl: mockFetch as any });

    // 1. Scan -> Results
    await controller.startScan("https://example.com");
    expect(controller.getState().currentView).toBe("results");
    const fetchCountAfterScan = fetchCount;

    // 2. Browser Back -> Landing
    controller.navigateToLanding();
    expect(controller.getState().currentView).toBe("landing");
    expect(fetchCount).toBe(fetchCountAfterScan);

    // 3. Browser Forward -> Results (restoring completed data)
    controller.navigateToResults();
    expect(controller.getState().currentView).toBe("results");
    expect(controller.getState().analysisData.score).toBe(82);
    // ZERO additional network fetches
    expect(fetchCount).toBe(fetchCountAfterScan);
  });

  test("Flow 7: Rapid duplicate scan clicks are guarded against duplicate network requests", async () => {
    let fetchCount = 0;
    const mockFetch = async (url: string | URL | Request): Promise<Response> => {
      fetchCount += 1;
      await new Promise((r) => setTimeout(r, 50));
      const urlStr = url.toString();
      if (urlStr.includes("/verify")) {
        return new Response(JSON.stringify({ ok: true, success: true, normalizedUrl: "https://example.com" }), { status: 200 });
      }
      return new Response(JSON.stringify(sampleReportData), { status: 200 });
    };

    const controller = createScanFlowController({ fetchImpl: mockFetch as any });

    // 3 rapid concurrent calls
    const p1 = controller.startScan("https://example.com");
    const p2 = controller.startScan("https://example.com");
    const p3 = controller.startScan("https://example.com");

    await Promise.all([p1, p2, p3]);

    // Only one scan should have been initiated (1 verify + 1 check = 2)
    expect(fetchCount).toBe(2);
    expect(controller.getState().currentView).toBe("results");
  });

  test("Flow 8: Defer results navigation -> Enters real Preparing results state with committed report -> Transitions to Results", async () => {
    const mockFetch = async (url: string | URL | Request): Promise<Response> => {
      const urlStr = url.toString();
      if (urlStr.includes("/verify")) {
        return new Response(JSON.stringify({ ok: true, success: true, normalizedUrl: "https://example.com" }), { status: 200 });
      }
      return new Response(JSON.stringify(sampleReportData), { status: 200 });
    };

    const controller = createScanFlowController({
      fetchImpl: mockFetch as any,
      deferResultsNavigation: true,
    });

    await controller.startScan("https://example.com");

    // Must be in the real "Preparing results" state while remaining on scan view for UI render
    expect(controller.getState().currentView).toBe("scan");
    expect(controller.getState().isPreparingResults).toBe(true);
    expect(controller.getState().isPending).toBe(false);
    expect(controller.getState().isVerifying).toBe(false);
    expect(controller.getState().analysisData).toBeDefined();
    expect(controller.getState().analysisData.score).toBe(82);

    // Frontend completes transition
    controller.completeScanToResults();
    expect(controller.getState().currentView).toBe("results");
    expect(controller.getState().isPreparingResults).toBe(false);
  });

  test("Flow 9: Scan Cancel -> Aborts active request and resets to landing with zero navigation to results", async () => {
    let checkCalled = false;
    const mockFetch = async (url: string | URL | Request): Promise<Response> => {
      const urlStr = url.toString();
      if (urlStr.includes("/verify")) {
        return new Response(JSON.stringify({ ok: true, success: true, normalizedUrl: "https://example.com" }), { status: 200 });
      }
      checkCalled = true;
      return new Response(JSON.stringify(sampleReportData), { status: 200 });
    };

    const controller = createScanFlowController({
      fetchImpl: mockFetch as any,
      deferResultsNavigation: true,
    });

    // Start scan and immediately cancel
    const scanPromise = controller.startScan("https://example.com");
    controller.cancelScan();
    await scanPromise;

    expect(controller.getState().currentView).toBe("landing");
    expect(controller.getState().isPreparingResults).toBe(false);

    // completeScanToResults must NOT move to results after cancel
    controller.completeScanToResults();
    expect(controller.getState().currentView).toBe("landing");
  });
});
