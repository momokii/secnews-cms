import { PAGE_SIZE_OPTIONS } from "./pageSizeOptions";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Disables every control while the next page is in flight. */
  disabled?: boolean;
  /** Plural noun for the count line, e.g. "items", "tickets". */
  itemLabel: string;
  /** Page-size choices; defaults to every shared option. */
  options?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Shared list footer: page position, per-page selector, prev/next. Buttons
 * keep the bare accessible names "Previous"/"Next" — page tests select them
 * by name. */
export function Pagination({
  page,
  pageSize,
  total,
  disabled = false,
  itemLabel,
  options = PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span className="flex items-center gap-3">
        <span>
          Page {page} of {totalPages} — {total} {itemLabel}
        </span>
        <label className="flex items-center gap-1">
          <span>Per page</span>
          <select
            aria-label="Items per page"
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-md border border-slate-200 px-1 py-0.5 text-slate-700 focus:border-indigo-600 focus:outline-none"
          >
            {options.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || disabled}
          className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || disabled}
          className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Next
        </button>
      </span>
    </div>
  );
}
