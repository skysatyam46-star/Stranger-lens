import { validateClientUrl } from "./url-client-validator";
import { mapBackendToFrontend } from "./mapper";

export interface ScanFlowState {
  url: string;
  submittedUrl: string;
  currentView: "landing" | "scan" | "results";
  isVerifying: boolean;
  isPending: boolean;
  isPreparingResults: boolean;
  errorMessage: string | null;
  backendError: string | null;
  analysisData: any;
}

export interface ScanFlowControllerOptions {
  fetchImpl?: typeof fetch;
  deferResultsNavigation?: boolean;
  onStateChange?: (state: ScanFlowState) => void;
  onValidationError?: (message: string) => void;
}

export function createScanFlowController(options: ScanFlowControllerOptions = {}) {
  const fetchFn = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  let state: ScanFlowState = {
    url: "",
    submittedUrl: "",
    currentView: "landing",
    isVerifying: false,
    isPending: false,
    isPreparingResults: false,
    errorMessage: null,
    backendError: null,
    analysisData: null,
  };

  let activeRequestId = 0;
  let activeAbortController: AbortController | null = null;
  let isScanningInProgress = false;

  function emit(patch: Partial<ScanFlowState>) {
    state = { ...state, ...patch };
    options.onStateChange?.({ ...state });
  }

  function abortCurrentRequest() {
    activeRequestId += 1;
    isScanningInProgress = false;
    if (activeAbortController) {
      try {
        activeAbortController.abort();
      } catch {
        // Ignore abort errors
      }
      activeAbortController = null;
    }
  }

  function setUrl(nextUrl: string) {
    emit({
      url: nextUrl,
      errorMessage: null,
    });
  }

  function restoreSession(rawUrl: string, analysisData: any) {
    abortCurrentRequest();
    emit({
      url: rawUrl,
      submittedUrl: rawUrl,
      currentView: "results",
      isVerifying: false,
      isPending: false,
      isPreparingResults: false,
      errorMessage: null,
      backendError: null,
      analysisData,
    });
  }

  function resetToLanding(clearUrl: boolean = true) {
    abortCurrentRequest();
    emit({
      url: clearUrl ? "" : (state.submittedUrl || state.url),
      submittedUrl: clearUrl ? "" : state.submittedUrl,
      currentView: "landing",
      isVerifying: false,
      isPending: false,
      isPreparingResults: false,
      errorMessage: null,
      backendError: null,
      analysisData: null,
    });
  }

  function navigateToLanding() {
    abortCurrentRequest();
    emit({
      currentView: "landing",
      isVerifying: false,
      isPending: false,
      isPreparingResults: false,
      backendError: null,
    });
  }

  function navigateToResults() {
    abortCurrentRequest();
    if (state.analysisData) {
      emit({
        currentView: "results",
        isVerifying: false,
        isPending: false,
        isPreparingResults: false,
        backendError: null,
      });
    }
  }

  function cancelScan() {
    abortCurrentRequest();
    emit({
      url: state.submittedUrl || state.url,
      currentView: "landing",
      isVerifying: false,
      isPending: false,
      isPreparingResults: false,
      backendError: null,
    });
  }

  function completeScanToResults() {
    if (
      state.currentView === "scan" &&
      !state.isVerifying &&
      !state.isPending &&
      !state.backendError &&
      state.analysisData !== null
    ) {
      emit({
        currentView: "results",
        isPreparingResults: false,
      });
    }
  }

  async function startScan(overrideUrl?: string): Promise<void> {
    // Prevent duplicate scan requests from rapid clicks or rerenders
    if (isScanningInProgress || state.isVerifying || state.isPending) {
      return;
    }

    const rawTarget = (overrideUrl !== undefined ? overrideUrl : state.url).trim();
    const validation = validateClientUrl(rawTarget);

    if (!rawTarget || validation.status !== "valid" || !validation.normalizedUrl) {
      const msg = validation.message || "Please enter a valid website URL (e.g., stripe.com).";
      emit({
        url: overrideUrl !== undefined ? overrideUrl : state.url,
        errorMessage: msg,
        currentView: "landing",
        isVerifying: false,
        isPending: false,
      });
      options.onValidationError?.(msg);
      return;
    }

    abortCurrentRequest();
    isScanningInProgress = true;
    const currentReqId = activeRequestId;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    activeAbortController = controller;

    emit({
      url: rawTarget,
      submittedUrl: validation.normalizedUrl,
      currentView: "scan",
      isVerifying: true,
      isPending: true,
      errorMessage: null,
      backendError: null,
      analysisData: null,
    });

    try {
      const verifyRes = await fetchFn("/api/check/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: validation.normalizedUrl }),
        ...(controller ? { signal: controller.signal } : {}),
      });

      if (currentReqId !== activeRequestId) return;

      const verifyJson = await verifyRes.json().catch(() => null);
      if (currentReqId !== activeRequestId) return;

      const isVerifySuccess =
        verifyRes.ok &&
        Boolean(verifyJson?.success || verifyJson?.reachable || verifyJson?.ok);

      if (!isVerifySuccess) {
        const errMsg =
          verifyJson?.message ||
          verifyJson?.error ||
          "We couldn't reach that website. Please check the URL and try again.";
        emit({
          isVerifying: false,
          isPending: false,
          backendError: errMsg,
          analysisData: null,
        });
        return;
      }

      const finalTargetUrl =
        verifyJson?.finalUrl || verifyJson?.normalizedUrl || validation.normalizedUrl;
      emit({
        submittedUrl: finalTargetUrl,
        isVerifying: false,
        isPending: true,
      });

      const checkRes = await fetchFn("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalTargetUrl }),
        ...(controller ? { signal: controller.signal } : {}),
      });

      if (currentReqId !== activeRequestId) return;

      const checkJson = await checkRes.json().catch(() => null);
      if (currentReqId !== activeRequestId) return;

      let resolvedAnalysisData: any = null;
      if (checkRes.ok && checkJson) {
        if (checkJson.analysis && typeof checkJson.analysis.overall_score === "number") {
          const mapped = mapBackendToFrontend(
            checkJson.analysis,
            checkJson.domain || finalTargetUrl,
            checkJson.snapshot,
            checkJson.supportingContext
          );
          resolvedAnalysisData = {
            ...mapped,
            isFreeTierOnly: !checkJson?.entitlement?.unlocked,
            ...(checkJson.lockedPreviewCounts
              ? { lockedPreviewCounts: checkJson.lockedPreviewCounts }
              : {}),
          };
        } else if (typeof checkJson.score === "number") {
          resolvedAnalysisData = checkJson;
        }
      }

      if (!checkRes.ok || !resolvedAnalysisData) {
        const errMsg =
          checkJson?.message ||
          checkJson?.error ||
          "Couldn't complete the analysis right now. Please try again.";
        emit({
          isVerifying: false,
          isPending: false,
          backendError: errMsg,
          analysisData: null,
        });
        return;
      }

      emit({
        isVerifying: false,
        isPending: false,
        isPreparingResults: true,
        backendError: null,
        analysisData: resolvedAnalysisData,
        currentView: options.deferResultsNavigation ? "scan" : "results",
      });
    } catch (err: any) {
      if (currentReqId !== activeRequestId) return;
      if (err?.name === "AbortError") return;

      emit({
        isVerifying: false,
        isPending: false,
        backendError:
          "Network connection interrupted while analyzing your website. Please try again.",
        analysisData: null,
      });
    } finally {
      if (currentReqId === activeRequestId) {
        isScanningInProgress = false;
      }
    }
  }

  async function retryScan(): Promise<void> {
    if (isScanningInProgress || state.isVerifying || state.isPending) {
      return;
    }
    const target = state.submittedUrl || state.url;
    if (!target) return;
    await startScan(target);
  }

  return {
    getState: () => ({ ...state }),
    setUrl,
    startScan,
    retryScan,
    cancelScan,
    resetToLanding,
    navigateToLanding,
    navigateToResults,
    completeScanToResults,
    restoreSession,
  };
}
