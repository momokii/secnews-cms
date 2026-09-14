import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Pagination } from "../../components/Pagination";
import { DateFilter } from "../../components/DateFilter";
import {
  FINDING_TYPES,
  TICKET_ORIGINS,
  TICKET_STATUSES,
  type FindingType,
  type TicketOrigin,
  type TicketStatus,
} from "../../lib/ticketsApi";
import { useTickets } from "../../lib/useTickets";
import { formatTimestamp, type DateRange } from "../../lib/datetime";
import { CreateTicketDialog } from "./CreateTicketDialog";

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
  const [pageSize, setPageSize] = useState(20);
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [createOpen, setCreateOpen] = useState(false);

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
    pageSize,
    ...dateRange,
  });

  const tickets = ticketsQuery.data?.items ?? [];
  const total = ticketsQuery.data?.total ?? 0;
  const effectivePageSize = ticketsQuery.data?.pageSize ?? pageSize;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-slate-900">Tickets</h1>
        <div className="flex items-center gap-2">
          <input
            aria-label="Search tickets"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search title"
            className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"
          >
            Create ticket
          </button>
        </div>
      </div>

      {createOpen ? <CreateTicketDialog onClose={() => setCreateOpen(false)} /> : null}

      <DateFilter
        value={dateRange}
        onChange={(range) => {
          setDateRange(range);
          setPage(1);
        }}
      />

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

      <section
        aria-label="How tickets work"
        className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4"
      >
        <h2 className="text-sm font-semibold text-slate-900">How tickets work</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            Lifecycle: OPEN → RESEARCH → READY → SENT → CLOSED. Transitions only
            move forward — there is no reopen, CLOSED is terminal. ADMIN/EDITOR
            may close any not-yet-sent ticket early (cancel path).
          </li>
          <li>
            TLP is the traffic-light sharing control: CLEAR, GREEN, AMBER, RED.
            New tickets default AMBER; AMBER and RED are never pushed public.
          </li>
          <li>
            Finding type: VULNERABILITY_CVE for CVE-tracked vulnerabilities,
            THREAT_CAMPAIGN for named threats/campaigns, OTHER for anything else.
          </li>
          <li>
            Origin: AUTO_FEED tickets are spawned by taking a feed item;
            MANUAL tickets are created by an analyst directly.
          </li>
          <li>
            Enrichment review is a hard block: sending (READY → SENT) fails with
            409 PENDING_SUGGESTIONS while any AI suggestion is still PENDING,
            and requires at least one active target channel.
          </li>
        </ul>
      </section>

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
              <th scope="col" className="py-2 pr-4 font-medium">Updated</th>
              <th scope="col" className="py-2 font-medium">Taken By</th>
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
                  {formatTimestamp(ticket.createdAt)}
                </td>
                <td className="py-2 pr-4 text-slate-500">
                  {formatTimestamp(ticket.updatedAt)}
                </td>
                <td className="py-2 text-slate-500">{ticket.takenByName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={page}
        pageSize={effectivePageSize}
        total={total}
        disabled={ticketsQuery.isPlaceholderData}
        itemLabel="tickets"
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
