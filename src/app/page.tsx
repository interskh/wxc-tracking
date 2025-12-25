import { getCheckInfo } from "@/lib/storage";
import { getTrackingUrls } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const checkInfo = await getCheckInfo();
  const trackingUrls = getTrackingUrls();

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Webpage Tracker</h1>

      <div className="bg-gray-100 rounded-lg p-4 mb-6">
        <h2 className="font-semibold mb-2">Status</h2>
        <p>
          Last check:{" "}
          {checkInfo.lastCheck
            ? new Date(checkInfo.lastCheck).toLocaleString()
            : "Never"}
        </p>
        <p>Total posts tracked: {checkInfo.seenCount}</p>
      </div>

      <div className="bg-gray-100 rounded-lg p-4 mb-6">
        <h2 className="font-semibold mb-2">Tracking {trackingUrls.length} keyword(s)</h2>
        <ul className="list-disc list-inside">
          {trackingUrls.map(({ keyword }) => (
            <li key={keyword}>{keyword}</li>
          ))}
        </ul>
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <h2 className="font-semibold mb-2">Manual Check</h2>
        <p className="text-sm text-gray-600 mb-2">
          Trigger a manual check (for testing):
        </p>
        <code className="bg-white px-2 py-1 rounded text-sm">
          curl {typeof window !== "undefined" ? window.location.origin : ""}/api/cron
        </code>
      </div>
    </main>
  );
}
