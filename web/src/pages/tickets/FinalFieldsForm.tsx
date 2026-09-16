import { useState } from "react";
import {
  TLP_LEVELS,
  type TicketDetail,
  type Tlp,
} from "../../lib/ticketsApi";
import { usePatchTicketFields } from "../../lib/useTickets";

interface FinalFieldsFormProps {
  ticket: TicketDetail;
}

const inputClass =
  "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none";

/** Final (client-facing) output fields — PATCH /tickets/:id/fields. */
export function FinalFieldsForm({ ticket }: FinalFieldsFormProps) {
  const [title, setTitle] = useState(ticket.title);
  const [overview, setOverview] = useState(ticket.overview ?? "");
  const [description, setDescription] = useState(ticket.description ?? "");
  const [recommendations, setRecommendations] = useState(ticket.recommendations ?? "");
  const [references, setReferences] = useState(ticket.references.join("\n"));
  const [tlp, setTlp] = useState<Tlp>(ticket.tlp);
  const [saved, setSaved] = useState(false);
  const patchFields = usePatchTicketFields();

  const submit = (): void => {
    setSaved(false);
    patchFields.mutate(
      {
        id: ticket.id,
        patch: {
          title: title.trim(),
          overview,
          description,
          recommendations,
          references: references
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== ""),
          tlp,
        },
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Final fields</h2>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Title</span>
          <input
            aria-label="Title"
            type="text"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Overview</span>
          <textarea
            aria-label="Overview"
            rows={8}
            value={overview}
            onChange={(event) => setOverview(event.target.value)}
            className={`${inputClass} resize-y min-h-44`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Description</span>
          <textarea
            aria-label="Description"
            rows={12}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`${inputClass} resize-y min-h-64`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Recommendations</span>
          <textarea
            aria-label="Recommendations"
            rows={8}
            value={recommendations}
            onChange={(event) => setRecommendations(event.target.value)}
            className={`${inputClass} resize-y min-h-44`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">References (one per line)</span>
          <textarea
            aria-label="References (one per line)"
            rows={2}
            value={references}
            onChange={(event) => setReferences(event.target.value)}
            className={inputClass}
            placeholder="https://…"
          />
        </label>
        <label className="flex w-40 flex-col gap-1">
          <span className="text-xs text-slate-500">TLP</span>
          <select
            aria-label="TLP"
            value={tlp}
            onChange={(event) => setTlp(event.target.value as Tlp)}
            className={inputClass}
          >
            {TLP_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={patchFields.isPending}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Save fields
          </button>
          {saved ? <span className="text-sm text-emerald-700">Saved.</span> : null}
          {patchFields.isError ? (
            <p role="alert" className="text-sm text-red-600">
              {patchFields.error instanceof Error
                ? patchFields.error.message
                : "Failed to save fields."}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
