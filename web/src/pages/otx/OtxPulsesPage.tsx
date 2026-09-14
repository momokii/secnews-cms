import { useEffect, useState } from "react";
import { Pagination } from "../../components/Pagination";
import { formatTimestamp } from "../../lib/datetime";
import { useOtxPulses } from "../../lib/useBulletin";
import type { OtxPulseSource } from "../../lib/bulletinApi";
import { OtxPulseDetailModal } from "./OtxPulseDetailModal";

const SEARCH_DEBOUNCE_MS = 300;

const OTX_PAGE_SIZES = [10, 20, 50] as const;

export function OtxPulsesPage() {
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<OtxPulseSource>("subscribed");
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      setQuery(next);
      setPage((current) => (next === query ? current : 1));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput, query]);

  const pulsesQuery = useOtxPulses({
    page,
    source,
    pageSize,
    q: source === "search" ? query : "",
  });

  const pulses = pulsesQuery.data?.items ?? [];
  const total = pulsesQuery.data?.total ?? 0;
  const effectivePageSize = pulsesQuery.data?.pageSize ?? pageSize;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">OTX pulses</h1>
      <div className="mt-4 flex gap-1 border-b border-slate-200" role="tablist" aria-label="Pulse source">
        {([
          ["subscribed", "Subscribed"],
          ["mine", "My pulses"],
          ["search", "Search"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={source === value}
            onClick={() => {
              setSource(value);
              setPage(1);
            }}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${source === value ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "search" ? (
        <div className="mt-4">
          <input
            aria-label="Search pulses"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search pulses by keyword"
            className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
          />
        </div>
      ) : null}

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
              <th scope="col" className="py-2 pr-4 font-medium">Modified</th>
              <th scope="col" className="py-2 font-medium">Actions</th>
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
                <td className="py-2 pr-4 text-slate-500">
                  {pulse.modified === null ? "—" : formatTimestamp(pulse.modified)}
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => setDetailId(pulse.id)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={page}
        pageSize={effectivePageSize}
        total={total}
        disabled={pulsesQuery.isPlaceholderData}
        itemLabel="pulses"
        options={OTX_PAGE_SIZES}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      {detailId !== null ? (
        <OtxPulseDetailModal
          pulseId={detailId}
          name={pulses.find((pulse) => pulse.id === detailId)?.name ?? ""}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </section>
  );
}
