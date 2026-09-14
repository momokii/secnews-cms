import { ApiError } from "../../lib/api";
import { useSendTicket } from "../../lib/useTickets";
import { Modal } from "../../components/Modal";

interface SendDialogProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  /** Raised when the send comes back 409 PENDING_SUGGESTIONS (S2 hard block). */
  onBlocked: () => void;
}

/** Send targets: `all` — the backend resolves it to currently-ACTIVE channels
 * only (S3); explicit inactive ids would 409, so the FE never sends them. */
export function SendDialog({ open, onClose, ticketId, onBlocked }: SendDialogProps) {
  const send = useSendTicket();

  const submit = (): void => {
    send.mutate(
      { id: ticketId, body: { all: true } },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409) {
            onBlocked();
          }
        },
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Send bulletin">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-slate-700">Delivery targets</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="send-targets" checked readOnly />
          <span>
            <span className="text-sm text-slate-900">All active channels</span>
            <span className="block text-xs text-slate-500">
              Inactive channels are excluded automatically.
            </span>
          </span>
        </label>
      </fieldset>

      {send.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {send.error instanceof Error ? send.error.message : "Send failed."}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={send.isPending}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Send now
        </button>
      </div>
    </Modal>
  );
}
