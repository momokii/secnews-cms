import {
  dateInJakarta,
  jakartaDayBounds,
  subtractDays,
  subtractMonths,
  type DateRange,
} from "../lib/datetime";
import { useState } from "react";

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "Yesterday", days: 1 },
  { label: "Last 7 days", days: 6 },
  { label: "Last 30 days", days: 29 },
  { label: "Last 12 months", months: 12 },
] as const;

interface DateFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function dateFromRange(value: string | undefined): string {
  return value === undefined ? "" : dateInJakarta(new Date(value));
}

export function DateFilter({ value, onChange }: DateFilterProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const today = dateInJakarta();
  const activeRange = value.from === undefined || value.to === undefined ? "" : `${value.from}|${value.to}`;
  const applyPreset = (startDate: string): void => {
    const bounds = jakartaDayBounds(startDate);
    onChange({ from: bounds.from, to: jakartaDayBounds(today).to });
    setCustomOpen(false);
  };
  const customRange = (from: string, to: string): DateRange => ({
    ...(from === "" ? {} : { from: jakartaDayBounds(from).from }),
    ...(to === "" ? {} : { to: jakartaDayBounds(to).to }),
  });

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2" aria-label="Date filter">
      {PRESETS.map((preset) => {
        const startDate = "days" in preset
          ? subtractDays(today, preset.days)
          : subtractMonths(today, preset.months);
        const bounds = jakartaDayBounds(startDate);
        const rangeKey = `${bounds.from}|${jakartaDayBounds(today).to}`;
        return (
          <button
            key={preset.label}
            type="button"
            aria-pressed={activeRange === rangeKey}
            onClick={() => applyPreset(startDate)}
            className={`rounded-md border px-3 py-2 text-sm ${activeRange === rangeKey ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}
          >
            {preset.label}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={customOpen}
        onClick={() => setCustomOpen((open) => !open)}
        className={`rounded-md border px-3 py-2 text-sm ${customOpen ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}
      >
        Custom
      </button>
      {value.from !== undefined || value.to !== undefined ? (
        <button
          type="button"
          onClick={() => onChange({})}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          Clear
        </button>
      ) : null}
      {customOpen ? <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">From</span>
        <input
          aria-label="From date"
          type="date"
          value={dateFromRange(value.from)}
          onChange={(event) => onChange(customRange(event.target.value, dateFromRange(value.to)))}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
        />
      </label> : null}
      {customOpen ? <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">To</span>
        <input
          aria-label="To date"
          type="date"
          value={dateFromRange(value.to)}
          onChange={(event) => onChange(customRange(dateFromRange(value.from), event.target.value))}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
        />
      </label> : null}
    </div>
  );
}
