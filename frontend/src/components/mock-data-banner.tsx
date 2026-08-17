import { MOCK_DATA } from "@/lib/api/config";

/**
 * Fixed corner badge shown only while NEXT_PUBLIC_MOCK_DATA=true, so nobody mistakes
 * fixture data for real data. Renders nothing at all when mocks are off.
 */
export function MockDataBanner() {
  if (!MOCK_DATA) return null;

  return (
    <div
      role="status"
      aria-label="Mock data is enabled"
      className="pointer-events-none fixed bottom-2 left-2 z-[9999] rounded-md bg-red-600 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-lg"
    >
      Mock Data
    </div>
  );
}
