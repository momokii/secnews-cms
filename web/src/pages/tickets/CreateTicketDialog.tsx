import { useState } from "react";
import { useNavigate } from "react-router";
import { FINDING_TYPES, type FindingType } from "../../lib/ticketsApi";
import { useCreateTicket } from "../../lib/useTickets";
import { Modal } from "../../components/Modal";

interface CreateTicketDialogProps {
  onClose: () => void;
}

const inputClass =
  "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none";

/** Manual quick-capture (POST /tickets): title + findingType + optional
 * working summary; the backend stamps origin MANUAL, status OPEN. */
export function CreateTicketDialog({ onClose }: CreateTicketDialogProps) {
  const [title, setTitle] = useState("");
  const [findingType, setFindingType] = useState<FindingType>("OTHER");
  const [summary, setSummary] = useState("");
  const navigate = useNavigate();
  const createTicket = useCreateTicket();

  const canCreate = title.trim() !== "";

  const submit = (): void => {
    const trimmedTitle = title.trim();
    const trimmedSummary = summary.trim();
    createTicket.mutate(
      {
        body: {
          title: trimmedTitle,
          findingType,
          ...(trimmedSummary === "" ? {} : { summary: trimmedSummary }),
        },
      },
      {
        onSuccess: (ticket) => {
          onClose();
          navigate(`/tickets/${ticket.id}`);
        },
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="Create ticket">
      <form
        className="flex flex-col gap-3"
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
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Finding type</span>
          <select
            aria-label="Finding type"
            value={findingType}
            onChange={(event) => setFindingType(event.target.value as FindingType)}
            className={inputClass}
          >
            {FINDING_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Summary (optional)</span>
          <textarea
            aria-label="Summary"
            rows={3}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Working notes — what was observed"
            className={inputClass}
          />
        </label>

        {createTicket.isError ? (
          <p role="alert" className="text-sm text-red-600">
            {createTicket.error instanceof Error
              ? createTicket.error.message
              : "Failed to create the ticket."}
          </p>
        ) : null}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canCreate || createTicket.isPending}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Create ticket
          </button>
        </div>
      </form>
    </Modal>
  );
}
