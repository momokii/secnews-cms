import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Pagination } from "../../components/Pagination";
import { DateFilter } from "../../components/DateFilter";
import { formatTimestamp } from "../../lib/datetime";
import type { DateRange } from "../../lib/datetime";
import type { FeedItemStatus, TicketSummary } from "../../lib/feedsApi";
import {
  useFeedItems,
  useTakeFeedItem,
  useViewFeedItem,
} from "../../lib/useFeeds";

const STATUS_TABS = ["UNREVIEWED", "VIEWED", "TAKEN"] as const satisfies readonly FeedItemStatus[];

const SEARCH_DEBOUNCE_MS = 300;

export function FeedItemsPage() {
  const [status, setStatus] = useState<FeedItemStatus>("UNREVIEWED");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [takenTickets, setTakenTickets] = useState<Record<string, TicketSummary>>(
    {},
  );

  // Debounce the search box: only the value settled for SEARCH_DEBOUNCE_MS
  // reaches the API query.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const itemsQuery = useFeedItems({
    status,
    q: query === "" ? undefined : query,
    page,
    pageSize,
    ...dateRange,
  });
  const viewItem = useViewFeedItem();
  const takeItem = useTakeFeedItem();

  const items = itemsQuery.data?.items ?? [];
  const total = itemsQuery.data?.total ?? 0;
  const effectivePageSize = itemsQuery.data?.pageSize ?? pageSize;

  const handleTake = (id: string): void => {
    takeItem.mutate(id, {
      onSuccess: (ticket) => {
        setTakenTickets((current) => ({ ...current, [id]: ticket }));
      },
    });
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-slate-900">Feed items</h1>
        <input
          aria-label="Search"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search title / URL"
          className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
        />
      </div>

      <DateFilter
        value={dateRange}
        onChange={(range) => {
          setDateRange(range);
          setPage(1);
        }}
      />

      <div role="tablist" aria-label="Triage status" className="mt-4 flex gap-1 border-b border-slate-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={status === tab}
            onClick={() => {
              setStatus(tab);
              setPage(1);
            }}
            className={`rounded-t-md px-3 py-2 text-sm ${
              status === tab
                ? "border-b-2 border-indigo-600 font-semibold text-indigo-600"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {itemsQuery.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading feed items…</p>
      ) : itemsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {itemsQuery.error instanceof Error
            ? itemsQuery.error.message
            : "Failed to load feed items."}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No feed items match.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">Title</th>
              <th scope="col" className="py-2 pr-4 font-medium">Source</th>
              <th scope="col" className="py-2 pr-4 font-medium">Published</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const ticket =
                takenTickets[item.id] ??
                (item.ticketId === null
                  ? null
                  : { id: item.ticketId, title: item.title });
              return (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-900">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-500"
                    >
                      {item.title}
                    </a>
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{item.sourceName}</td>
                  <td className="py-2 pr-4 text-slate-500" title={item.publishedAt ?? undefined}>
                    {item.publishedAt === null ? "—" : formatTimestamp(item.publishedAt)}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        item.status === "TAKEN"
                          ? "bg-emerald-100 text-emerald-700"
                          : item.status === "VIEWED"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-2">
                    {ticket !== null ? (
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="text-indigo-600 hover:text-indigo-500"
                      >
                        Ticket #{ticket.id}
                      </Link>
                    ) : (
                      <span className="flex gap-2">
                        {item.status === "UNREVIEWED" ? (
                          <button
                            type="button"
                            onClick={() => viewItem.mutate(item.id)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                          >
                            Mark viewed
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleTake(item.id)}
                          className="rounded-md bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500"
                        >
                          Take
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Pagination
        page={page}
        pageSize={effectivePageSize}
        total={total}
        disabled={itemsQuery.isPlaceholderData}
        itemLabel="items"
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
