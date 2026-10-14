import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#090D15] text-[#F1F5F9] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#171F2D] border border-[#263044] text-white flex items-center justify-center font-bold text-xl mb-4 shadow-sm">
        S
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
        Page Not Found
      </h1>
      <p className="text-sm text-[#94A3B8] max-w-md mb-6">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="rounded-full bg-[#246BFD] hover:bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 transition-colors shadow-xs"
      >
        Return to StrangerLens
      </Link>
    </div>
  );
}
