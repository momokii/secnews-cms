import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { listChannels, type Channel } from "../../lib/clientsApi";
import { useClients } from "../../lib/useClients";
import { useSendTicket } from "../../lib/useTickets";
import { Modal } from "../../components/Modal";

interface SendDialogProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  /** Raised when the send comes back 409 PENDING_SUGGESTIONS (S2 hard block). */
  onBlocked: () => void;
}

type TargetMode = "all" | "select";

/** Chat/bcc target of a channel — WHATSAPP/TELEGRAM resolve to the chat id,
 * EMAIL to the BCC list (mirrors the delivery audit target column). */
function channelTarget(channel: Channel): string {
  if (channel.type === "EMAIL") return channel.bcc.join(", ");
  return channel.chatId;
}

interface ChannelRow {
  channel: Channel;
  clientName: string;
}

/** Send targets: `all` — the backend resolves it to currently-ACTIVE channels
 * only (S3); `select` — cherry-pick per-channel, inactive rows are disabled
 * because explicit inactive ids would 409 INACTIVE_TARGET. */
export function SendDialog({ open, onClose, ticketId, onBlocked }: SendDialogProps) {
  const [mode, setMode] = useState<TargetMode>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const send = useSendTicket();
  const clientsQuery = useClients(1, 100);
  const clients = clientsQuery.data?.items ?? [];
  const channelQueries = useQueries({
    queries: clients.map((client) => ({
      queryKey: ["channels", client.id],
      queryFn: () => listChannels(client.id),
    })),
  });
  const rows: ChannelRow[] = clients.flatMap((client, index) =>
    (channelQueries[index]?.data ?? []).map((channel) => ({
      channel,
      clientName: client.name,
    })),
  );
  const selectMode = mode === "select";
  const sendDisabled = send.isPending || (selectMode && selected.size === 0);

  const toggleChannel = (id: string, checked: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const submit = (): void => {
    if (selectMode && selected.size === 0) return;
    send.mutate(
      {
        id: ticketId,
        body: selectMode ? { channelIds: [...selected] } : { all: true },
      },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (
            error instanceof ApiError &&
            error.status === 409 &&
            error.code === "PENDING_SUGGESTIONS"
          ) {
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
          <input
            type="radio"
            name="send-targets"
            checked={mode === "all"}
            onChange={() => setMode("all")}
          />
          <span>
            <span className="text-sm text-slate-900">All active channels</span>
            <span className="block text-xs text-slate-500">
              Inactive channels are excluded automatically.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="send-targets"
            checked={selectMode}
            onChange={() => setMode("select")}
          />
          <span className="text-sm text-slate-900">Select channels</span>
        </label>
      </fieldset>

      {selectMode ? (
        clientsQuery.isPending ? (
          <p className="mt-3 text-sm text-slate-500">Loading channels…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No channels configured yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {rows.map(({ channel, clientName }) => {
              const disabled = !channel.active;
              return (
                <li key={channel.id}>
                  <label
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                      disabled ? "opacity-60" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${clientName} ${channel.type} channel`}
                      checked={!disabled && selected.has(channel.id)}
                      disabled={disabled}
                      onChange={(event) =>
                        toggleChannel(channel.id, event.target.checked)
                      }
                    />
                    <span className="font-medium text-slate-900">{clientName}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {channel.type}
                    </span>
                    <span className="truncate text-slate-700">
                      {channelTarget(channel)}
                    </span>
                    {disabled ? (
                      <span className="ml-auto text-xs text-slate-500">
                        Inactive — excluded from sending
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

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
          disabled={sendDisabled}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Send now
        </button>
      </div>
    </Modal>
  );
}
