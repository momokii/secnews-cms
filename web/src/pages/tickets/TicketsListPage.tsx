import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  FINDING_TYPES,
  TICKET_ORIGINS,
  TICKET_STATUSES,
  type FindingType,
  type TicketOrigin,
  type TicketStatus,
} from "../../lib/ticketsApi";
import { useTickets } from "../../lib/useTickets";

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_BADGE_CLASSES: Readonly<Record<TicketStatus, string>> = {
  OPEN: "bg-slate-100 text-slate-700",
  RESEARCH: "bg-amber-100 text-amber-700",
  READY: "bg-indigo-100 text-indigo-700",
  SENT: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-slate-200 text-slate-600",
};

const selectClass =
  "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none";

/** Ticket list with status / origin / findingType / q filters (contract #21). */
export function TicketsListPage() {
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [origin, setOrigin] = useState<TicketOrigin | "">("");
  const [findingType, setFindingType] = useState<FindingType | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Debounce the search box: only the value settled for SEARCH_DEBOUNCE_MS
  // reaches the API query.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const ticketsQuery = useTickets({
    q: query === "" ? undefined : query,
    status: status === "" ? undefined : status,
    origin: origin === "" ? undefined : origin,
    findingType: findingType === "" ? undefined : findingType,
    page,
  });

  const tickets = ticketsQuery.data?.items ?? [];
  const total = ticketsQuery.data?.total ?? 0;
  const pageSize = ticketsQuery.data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-slate-900">Tickets</h1>
        <input
          aria-label="Search tickets"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search title"
          className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Status</span>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as TicketStatus | "");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Origin</span>
          <select
            aria-label="Filter by origin"
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value as TicketOrigin | "");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All origins</option>
            {TICKET_ORIGINS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Finding type</span>
          <select
            aria-label="Filter by finding type"
            value={findingType}
            onChange={(event) => {
              setFindingType(event.target.value as FindingType | "");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All types</option>
            {FINDING_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ticketsQuery.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading tickets…</p>
      ) : ticketsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {ticketsQuery.error instanceof Error
            ? ticketsQuery.error.message
            : "Failed to load tickets."}
        </p>
      ) : tickets.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No tickets match.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">Title</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 pr-4 font-medium">Origin</th>
              <th scope="col" className="py-2 pr-4 font-medium">Finding type</th>
              <th scope="col" className="py-2 pr-4 font-medium">TLP</th>
              <th scope="col" className="py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-900">
                  <Link
                    to={`/tickets/${ticket.id}`}
                    className="text-indigo-600 hover:text-indigo-500"
                  >
                    {ticket.title}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[ticket.status]}`}
                  >
                    {ticket.status}
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-500">{ticket.origin}</td>
                <td className="py-2 pr-4 text-slate-500">{ticket.findingType}</td>
                <td className="py-2 pr-4 text-slate-500">{ticket.tlp}</td>
                <td className="py-2 text-slate-500">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {page} of {totalPages} — {total} tickets
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || ticketsQuery.isPlaceholderData}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages || ticketsQuery.isPlaceholderData}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </span>
      </div>
    </section>
  );
}
