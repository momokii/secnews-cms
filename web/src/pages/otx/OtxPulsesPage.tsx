import { useState } from "react";
import { useOtxPulses } from "../../lib/useBulletin";

export function OtxPulsesPage() {
  const [page, setPage] = useState(1);
  const pulsesQuery = useOtxPulses(page);

  const pulses = pulsesQuery.data?.items ?? [];
  const total = pulsesQuery.data?.total ?? 0;
  const pageSize = pulsesQuery.data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">OTX pulses</h1>

      {pulsesQuery.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading pulses…</p>
      ) : pulsesQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {pulsesQuery.error instanceof Error
            ? pulsesQuery.error.message
            : "Failed to load OTX pulses."}
        </p>
      ) : pulses.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No pulses yet.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">Name</th>
              <th scope="col" className="py-2 pr-4 font-medium">TLP</th>
              <th scope="col" className="py-2 pr-4 font-medium">Visibility</th>
              <th scope="col" className="py-2 pr-4 font-medium">Indicators</th>
              <th scope="col" className="py-2 pr-4 font-medium">Tags</th>
              <th scope="col" className="py-2 font-medium">Modified</th>
            </tr>
          </thead>
          <tbody>
            {pulses.map((pulse) => (
              <tr key={pulse.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-900">{pulse.name}</td>
                <td className="py-2 pr-4">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {pulse.tlp}
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-500">
                  {pulse.isPublic ? "Public" : "Private"}
                </td>
                <td className="py-2 pr-4 text-slate-500">{pulse.indicatorCount}</td>
                <td className="py-2 pr-4 text-slate-500">{pulse.tags.join(", ")}</td>
                <td className="py-2 text-slate-500">
                  {new Date(pulse.modified).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {page} of {totalPages} — {total} pulses
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || pulsesQuery.isPlaceholderData}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages || pulsesQuery.isPlaceholderData}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </span>
      </div>
    </section>
  );
}
