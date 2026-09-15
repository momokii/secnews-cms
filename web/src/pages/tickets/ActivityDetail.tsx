import type { TicketActivity } from "../../lib/ticketsApi";

const UPDATED_SUFFIX = " (updated)";

const FIELD_VALUE_DISPLAY_LIMIT = 120;
const EMPTY_VALUE_LABEL = "(empty)";

type FieldChange = { from: string | null; to: string | null };

/** Wire detail is JSON `{"field":{"from":<old|null>,"to":<new>}}`; any other
 * shape (legacy names-only rows) fails the parse and falls back verbatim. */
function parseFieldChanges(detail: string): Record<string, FieldChange> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const changes: Record<string, FieldChange> = {};
  for (const [field, value] of Object.entries(parsed)) {
    const change = fieldChange(value);
    if (change === null) {
      return null;
    }
    changes[field] = change;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

function fieldChange(value: unknown): FieldChange | null {
  if (typeof value !== "object" || value === null || !("from" in value && "to" in value)) {
    return null;
  }
  const { from, to } = value;
  if (!(from === null || typeof from === "string") || !(to === null || typeof to === "string")) {
    return null;
  }
  return { from, to };
}

function displayFieldValue(value: string | null): string {
  return value === null || value === "" ? EMPTY_VALUE_LABEL : value;
}

interface SuggestionDecision {
  field: string;
  value: string;
  decision: string;
}

/** Wire detail for SUGGESTION_ACCEPTED/REJECTED is JSON
 * `{"field":…,"value":…,"decision":…}`; any other shape fails the parse and
 * falls back verbatim. */
function parseSuggestionDecision(detail: string): SuggestionDecision | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.field !== "string" ||
    typeof record.value !== "string" ||
    typeof record.decision !== "string"
  ) {
    return null;
  }
  return { field: record.field, value: record.value, decision: record.decision };
}

function decisionLabel(decision: string): string {
  if (decision === "ACCEPTED") return "accepted";
  if (decision === "REJECTED") return "rejected";
  return decision.toLowerCase();
}

function truncateForDisplay(text: string): string {
  return text.length > FIELD_VALUE_DISPLAY_LIMIT
    ? `${text.slice(0, FIELD_VALUE_DISPLAY_LIMIT)}…`
    : text;
}

/** One "field: old → new" row per changed field; the full untruncated values
 * live in each span's title attribute. */
function FieldChangeList({ changes }: { changes: Record<string, FieldChange> }) {
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
      {Object.entries(changes).map(([field, change]) => (
        <li key={field}>
          <span className="font-medium text-slate-700">{field}: </span>
          <span title={displayFieldValue(change.from)}>
            {truncateForDisplay(displayFieldValue(change.from))}
          </span>
          {" → "}
          <span title={displayFieldValue(change.to)}>
            {truncateForDisplay(displayFieldValue(change.to))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Wire detail is "status <FROM>→<TO>"; unparseable shapes render verbatim. */
function statusChangeDetail(detail: string): string {
  const match = /^status (\S+)→(\S+)$/.exec(detail);
  return match === null ? detail : `Status: ${match[1]} → ${match[2]}`;
}

/** Wire detail is the pulse id plus an optional "(updated)" marker. */
function splitOtxDetail(detail: string): { pulseId: string; updated: boolean } {
  const updated = detail.endsWith(UPDATED_SUFFIX);
  return {
    pulseId: updated ? detail.slice(0, -UPDATED_SUFFIX.length) : detail,
    updated,
  };
}

/** Detail line per action. FIELDS_UPDATED carries recorded per-field values
 * when available; legacy names-only rows and pulse ids render honestly,
 * never with invented values. */
export function ActivityDetail({
  entry,
  pulseId,
  pulseUrl,
}: {
  entry: TicketActivity;
  pulseId: string | null;
  pulseUrl: string | null;
}) {
  if (entry.detail === null) {
    return null;
  }
  if (entry.action === "STATUS_CHANGED") {
    return (
      <p className="mt-1 text-xs text-slate-600">{statusChangeDetail(entry.detail)}</p>
    );
  }
  if (entry.action === "FIELDS_UPDATED") {
    const changes = parseFieldChanges(entry.detail);
    if (changes !== null) {
      return <FieldChangeList changes={changes} />;
    }
    const names = entry.detail
      .split(",")
      .map((name) => name.trim())
      .join(", ");
    return (
      <p className="mt-1 text-xs text-slate-600">
        <span>Updated fields: {names}</span>
        {" — "}
        <span className="text-slate-500">previous values are not recorded</span>
      </p>
    );
  }
  if (entry.action === "SUGGESTION_ACCEPTED" || entry.action === "SUGGESTION_REJECTED") {
    const decision = parseSuggestionDecision(entry.detail);
    if (decision !== null) {
      return (
        <p className="mt-1 text-xs text-slate-600">
          <span className="font-medium text-slate-700">{decision.field}: </span>
          <span title={decision.value}>{truncateForDisplay(decision.value)}</span>
          {" — "}
          <span>{decisionLabel(decision.decision)}</span>
        </p>
      );
    }
    return <p className="mt-1 text-xs text-slate-600">{entry.detail}</p>;
  }
  if (entry.action === "OTX_PUSHED") {
    const { pulseId: entryPulseId, updated } = splitOtxDetail(entry.detail);
    const confirmed = pulseUrl !== null && pulseId === entryPulseId;
    return (
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
          OTX push detail
        </summary>
        <p className="mt-1 text-xs text-slate-600">
          <span>
            {entryPulseId}
            {updated ? UPDATED_SUFFIX : ""}
          </span>
          {confirmed ? (
            <>
              {" — "}
              <a
                href={pulseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:text-indigo-500"
              >
                View on OTX
              </a>
            </>
          ) : null}
        </p>
      </details>
    );
  }
  return <p className="mt-1 text-xs text-slate-600">{entry.detail}</p>;
}
