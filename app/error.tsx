'use client';

import React from 'react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen w-full bg-[#090D15] text-[#F1F5F9] flex flex-col items-center justify-center p-4 text-center">
      <div className="w-10 h-10 rounded-xl bg-[#171F2D] border border-[#263044] text-white flex items-center justify-center font-bold text-base mb-4">
        S
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
      <p className="text-sm text-[#94A3B8] max-w-md mb-6">
        An unexpected error occurred. Please try reloading the page.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-full bg-[#246BFD] hover:bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
