"use client";
import React, { useState, useMemo } from "react";
import { Link2, Clock, Share2, Download, AlertCircle, Check, Zap, Info, X, Lock, Mail, ArrowRight, Sparkles, Shield, Users, Eye, ChevronDown } from "lucide-react";
import Link from "next/link";
import { adaptReport, SIGNAL_ID_TO_KEY } from "@/lib/report-adapter";

export interface AnalysisData {
  domain: string;
  score: number;
  scoreStatus: "Needs improvement" | "Good" | "Needs work" | "Excellent";
  verdict: string;
  verdictSubtext: string;
  quickSignals: Array<{
    label: string;
    type: "clear" | "amber" | "coral";
  }>;
  firstSeconds: Array<{
    question: string;
    label: string;
    type: "clear" | "partly" | "unclear";
  }>;
  visitorThought: string;
  evidence: {
    locationTag: string;
    homepageExcerpt: string;
    clearFindings: string[];
    missingFindings: string[];
  };
  signals: Array<{
    id: string;
    title: string;
    score: number;
    badgeText: string;
    badgeType: "clear" | "amber" | "coral";
    description: string;
    icon: string;
  }>;
  websiteMessage?: {
    summary: string;
    confidence: "high" | "medium" | "low";
  };
  risks?: Array<{
    category: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    why_it_matters: string;
  }>;
  recommendation: {
    title: string;
    subhead: string;
    explanation: string;
    impact?: "high" | "medium";
    currentDirection: string;
    strongerDirection: string;
  };
  otherImprovements: Array<{
    id: string;
    title: string;
    description: string;
    whyItMatters: string;
    whatToImprove: string;
    copyableSuggestion?: string;
    icon: string;
    color: string;
  }>;
  supportingContext?: any;
  isFreeTierOnly?: boolean;
  isPartialAccess?: boolean;
  isAccessError?: boolean;
  checkedAt?: string;
  lockedPreviewCounts?: {
    actionSteps: number;
    secondaryFixes: number;
    copyRewrites: number;
    totalRisks: number;
  };
}

export default function ResultsScreen({
  rawUrl,
  analysisData: data,
  isUnlocked = false,
  onBackToLanding,
  onRunNewCheck,
  onRecheck,
  onOpenFaq,
  onOpenPricing,
}: any) {
  const [activeExplorerSignalId, setActiveExplorerSignalId] = useState("first-impression");
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isReportUnlocked = Boolean(isUnlocked);

  // Canonical report normalized from authoritative analysis data
  const report = useMemo(() => adaptReport(data), [data]);

  const explorerTabs = [
    { id: "first-impression", label: "First Impression" },
    { id: "audience", label: "Audience" },
    { id: "value", label: "Value" },
    { id: "trust", label: "Trust" },
    { id: "action", label: "Action" },
  ];

  const activeSignalKey = SIGNAL_ID_TO_KEY[activeExplorerSignalId] || "firstImpression";
  const activeSignal = report.signals[activeSignalKey];

  if (!data) return null;

  return (
    <div id="results-content" className="min-h-screen bg-[#090D15] text-[#F1F5F9] font-sans antialiased flex flex-col">
      {/* SCORE CALCULATION MODAL */}
      {isScoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-[#121824] border border-[#263044] rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-white mb-4">How is this calculated?</h3>
            <p className="text-[#94A3B8] text-sm mb-6">Your overall clarity score is a weighted average of your five signal scores: First Impression (25%), Audience (20%), Value (25%), Trust (15%), and Action (15%).</p>
            <button onClick={() => setIsScoreModalOpen(false)} className="w-full bg-[#171F2D] hover:bg-[#263044] text-white font-bold py-3 rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="w-full bg-[#090D15]/95 backdrop-blur-md border-b border-[#263044] sticky top-0 z-30">
        <div className="max-w-[1000px] mx-auto px-4 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToLanding}
            className="flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            aria-label="Return to StrangerLens home"
          >
            <span className="font-bold text-xl tracking-tight text-white hover:text-slate-200 transition-colors">
              StrangerLens
            </span>
          </button>
          <button
            type="button"
            onClick={onRunNewCheck || onBackToLanding}
            className="rounded-full bg-[#171F2D] hover:bg-[#263044] text-white font-semibold px-4 py-2 transition text-sm cursor-pointer"
          >
            New Check
          </button>
        </div>
        <div className="max-w-[1000px] mx-auto px-4 py-2 flex items-center justify-between text-sm text-[#94A3B8]">
          <span className="font-medium text-[#F1F5F9]">{report.domain}</span>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full max-w-[1000px] mx-auto px-4 py-10 space-y-12">
        {/* OVERALL CLARITY SCORE */}
        <section className="bg-[#121824] border border-[#263044] rounded-2xl p-6">
          <h2 className="text-sm font-bold text-[#94A3B8] uppercase tracking-wider mb-4">Website Clarity Score</h2>
          <div className="flex items-end justify-between">
             <div>
               <div className="text-5xl font-bold text-white">{report.overallScoreDisplay}</div>
               <div className="text-emerald-400 font-semibold mt-1">{report.overallStatus}</div>
             </div>
             <button onClick={() => setIsScoreModalOpen(true)} className="text-sm text-blue-400 hover:text-blue-300 font-medium underline">How is this calculated?</button>
          </div>
        </section>

        {/* 1. FREE: FIVE CLARITY SIGNALS */}
        <section>
          <h2 className="text-xl font-bold mb-6 text-[#F1F5F9]">Clarity Signals</h2>
          <div className="bg-[#121824] border border-[#263044] rounded-xl overflow-hidden">
            {report.signalsList.map((signal, index) => (
              <div key={signal.id} className={`flex items-center justify-between p-4 ${index !== report.signalsList.length - 1 ? 'border-b border-[#263044]' : ''}`}>
                <span className="font-medium text-[#F1F5F9]">{signal.title}</span>
                <div className="flex items-center gap-4">
                   <div className="text-right">
                      <div className="font-bold text-white text-sm">{signal.scoreDisplay}</div>
                      <div className={`text-[10px] uppercase font-semibold tracking-wider ${
                        signal.badgeType === "clear"
                          ? "text-emerald-400"
                          : signal.badgeType === "amber"
                          ? "text-amber-400"
                          : signal.badgeType === "coral"
                          ? "text-rose-400"
                          : "text-[#94A3B8]"
                      }`}>
                        {signal.status}
                      </div>
                   </div>
                   <div className="w-16 h-1 bg-[#263044] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          signal.badgeType === "clear"
                            ? "bg-emerald-500"
                            : signal.badgeType === "amber"
                            ? "bg-amber-500"
                            : signal.badgeType === "coral"
                            ? "bg-rose-500"
                            : "bg-[#263044]"
                        }`}
                        style={{ width: `${signal.score ?? 0}%` }}
                      />
                   </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PAYWALL */}
        {!isReportUnlocked && (
          <section className="bg-[#121824] border border-[#263044] rounded-2xl p-6 text-center shadow-lg">
            <h2 className="text-xl font-bold mb-2 text-white">Unlock Full Report</h2>
            <p className="text-[#94A3B8] text-sm mb-6 max-w-sm mx-auto">Get detailed signal diagnostics, actionable improvement steps, and visitor comprehension analysis.</p>
            <div className="space-y-2 mb-6 text-sm text-[#F1F5F9] font-medium">
              <div className="flex items-center justify-center gap-2">✓ In-depth signal diagnostics</div>
              <div className="flex items-center justify-center gap-2">✓ Actionable improvement steps</div>
            </div>
            <div className="text-2xl font-bold mb-6 text-white">$5 <span className="text-sm text-[#94A3B8] font-normal">· One-time payment</span></div>
            <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg text-sm transition">Unlock Full Report — $5</button>
            <p className="text-xs text-[#94A3B8] mt-4">One-time payment · No subscription · Terms · Privacy · Refund Policy · Support</p>
          </section>
        )}

        {/* PREMIUM: INTERACTIVE ANALYSIS */}
        <section>
          <h2 className="text-xl font-bold mb-6 text-white">Signal Diagnostics</h2>
          
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
            {explorerTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveExplorerSignalId(tab.id)}
                className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition ${activeExplorerSignalId === tab.id ? "bg-blue-600 text-white" : "bg-[#121824] border border-[#263044] text-[#94A3B8]"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-[#121824] border border-[#263044] rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">{activeSignal.title}</h3>
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                  activeSignal.badgeType === "clear"
                    ? "text-emerald-400"
                    : activeSignal.badgeType === "amber"
                    ? "text-amber-400"
                    : activeSignal.badgeType === "coral"
                    ? "text-rose-400"
                    : "text-[#94A3B8]"
                }`}>
                  {activeSignal.status}
                </span>
              </div>
              <div className="text-sm font-bold text-white">{activeSignal.scoreDisplay}</div>
            </div>
            
            <div className="space-y-6">
              <div>
                <h4 className="text-[10px] font-bold text-blue-400 mb-2 tracking-widest uppercase">Why This Score</h4>
                <p className="text-[#94A3B8] text-sm">
                  {activeSignal.explanation || "Diagnostic analysis not available for this signal."}
                </p>
              </div>
              <div className="border-t border-[#263044]"></div>
              <div>
                <h4 className="text-[10px] font-bold text-emerald-400 mb-2 tracking-widest uppercase">What&apos;s Working</h4>
                {activeSignal.positiveFindings.length > 0 ? (
                  <ul className="text-[#94A3B8] text-sm space-y-1.5">
                    {activeSignal.positiveFindings.map((finding, i) => (
                      <li key={i}>✓ {finding}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#94A3B8] text-sm">No clear positive signals detected in the initial content.</p>
                )}
              </div>
              <div className="border-t border-[#263044]"></div>
              <div>
                <h4 className="text-[10px] font-bold text-amber-400 mb-2 tracking-widest uppercase">What&apos;s Unclear</h4>
                {activeSignal.concerns.length > 0 ? (
                  <ul className="text-[#94A3B8] text-sm space-y-1.5">
                    {activeSignal.concerns.map((concern, i) => (
                      <li key={i}>! {concern}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#94A3B8] text-sm">No significant ambiguities identified for this signal.</p>
                )}
              </div>
              <div className="border-t border-[#263044]"></div>
              <div>
                <h4 className="text-[10px] font-bold text-rose-400 mb-2 tracking-widest uppercase">How to Improve</h4>
                {activeSignal.recommendations.length > 0 ? (
                  <ul className="text-[#94A3B8] text-sm space-y-1.5">
                    {activeSignal.recommendations.map((rec, i) => (
                      <li key={i}>→ {rec}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#94A3B8] text-sm">Maintain current messaging clarity in this area.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* FIRST 5 SECONDS */}
        <section>
          <h2 className="text-xl font-bold mb-2 text-white">First 5 Seconds</h2>
          <p className="text-[#94A3B8] text-sm mb-6">What a first-time visitor grasps in the first 5 seconds.</p>
          <div className="grid gap-6">
            <div className="bg-[#121824] border border-[#263044] rounded-xl p-5">
              <h3 className="font-bold text-emerald-400 text-xs mb-3 tracking-widest uppercase">WHAT VISITORS UNDERSTAND</h3>
              {report.firstSeconds.understandItems.length > 0 ? (
                <div className="space-y-3">
                  {report.firstSeconds.understandItems.map((item, i) => (
                    <div key={i} className="text-sm">
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="text-[#94A3B8] mt-0.5">{item.explanation}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#94A3B8] text-sm">No elements detected as immediately clear on initial load.</p>
              )}
            </div>
            <div className="bg-[#121824] border border-[#263044] rounded-xl p-5">
              <h3 className="font-bold text-amber-400 text-xs mb-3 tracking-widest uppercase">WHAT VISITORS MISS</h3>
              {report.firstSeconds.missItems.length > 0 ? (
                <div className="space-y-3">
                  {report.firstSeconds.missItems.map((item, i) => (
                    <div key={i} className="text-sm">
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="text-[#94A3B8] mt-0.5">{item.explanation}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#94A3B8] text-sm">No immediate comprehension blockers identified.</p>
              )}
            </div>
          </div>
        </section>

        {/* ACTIONS */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-[#263044]">
          <button 
            onClick={() => {
              import('html2canvas').then(html2canvas => {
                const target = document.getElementById('results-content');
                if (!target) return;
                html2canvas.default(target, { scale: 2, useCORS: true }).then(canvas => {
                  const link = document.createElement('a');
                  link.download = `strangerlens-${report.domain}.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                });
              });
            }}
            className="flex-1 bg-[#171F2D] hover:bg-[#263044] text-white font-semibold py-3 rounded-lg text-sm transition"
          >
            Export Summary
          </button>
          <button 
            onClick={() => {
              Promise.all([
                import('html2canvas'),
                import('jspdf')
              ]).then(([html2canvas, jspdf]) => {
                const target = document.getElementById('results-content');
                if (!target) return;
                html2canvas.default(target, { scale: 2, useCORS: true }).then(canvas => {
                  const imgData = canvas.toDataURL('image/png');
                  const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
                  const pdfWidth = pdf.internal.pageSize.getWidth();
                  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                  const pageHeight = pdf.internal.pageSize.getHeight();
                  let heightLeft = pdfHeight;
                  let position = 0;

                  pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                  heightLeft -= pageHeight;

                  while (heightLeft > 0) {
                    position = heightLeft - pdfHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                    heightLeft -= pageHeight;
                  }

                  pdf.save(`strangerlens-${report.domain}.pdf`);
                });
              });
            }}
            className="flex-1 bg-[#171F2D] hover:bg-[#263044] text-white font-semibold py-3 rounded-lg text-sm transition"
          >
            Download PDF
          </button>
        </div>
      </main>
    </div>
  );
}

export function buildReportSummaryForExport(data: any, isUnlocked: boolean): string {
  if (!isUnlocked) {
    return `STRANGERLENS FREE PREVIEW SUMMARY
URL: ${data?.url || data?.domain || ""}
FIVE SIGNAL OVERVIEW:
${data?.signals?.map((s: any) => `- ${s.name}: ${s.score}/100`).join("\n") || ""}
BIGGEST ISSUE + EVIDENCE:
${data?.biggestIssue?.title || ""} - ${data?.biggestIssue?.description || ""}
YOUR #1 PRIORITY FIX:
${data?.priorityFix?.action || ""}`;
  }
  return `STRANGERLENS FULL FIRST-IMPRESSION REPORT
URL: ${data?.url || data?.domain || ""}
FIRST-TIME VISITOR IMPRESSION:
${data?.visitorThought || ""}
FIVE DETAILED SIGNAL BREAKDOWN:
${data?.signals?.map((s: any) => `- ${s.name}: ${s.score}/100 (${s.explanation || ""})`).join("\n") || ""}
COMMUNICATION RISKS:
${data?.risks?.map((r: any) => `- ${r}`).join("\n") || ""}`;
}
