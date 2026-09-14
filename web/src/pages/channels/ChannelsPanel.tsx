import { useState } from "react";
import { Modal } from "../../components/Modal";
import type {
  Channel,
  ChannelType,
  Client,
  CreateChannelBody,
} from "../../lib/clientsApi";
import {
  useChannels,
  useCreateChannel,
  useDeleteChannel,
  useUpdateChannel,
} from "../../lib/useClients";

interface ChannelForm {
  type: ChannelType;
  chatId: string;
  token: string;
  bcc: string;
}

const EMPTY_FORM: ChannelForm = {
  type: "WHATSAPP",
  chatId: "",
  token: "",
  bcc: "",
};

function parseBcc(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function buildCreateBody(form: ChannelForm): CreateChannelBody {
  if (form.type === "WHATSAPP") return { type: "WHATSAPP", chatId: form.chatId };
  if (form.type === "TELEGRAM") {
    return { type: "TELEGRAM", chatId: form.chatId, token: form.token };
  }
  return { type: "EMAIL", bcc: parseBcc(form.bcc) };
}

function channelSummary(channel: Channel): string {
  if (channel.type === "WHATSAPP") return channel.chatId;
  if (channel.type === "TELEGRAM") {
    return `${channel.chatId} · token ${channel.tokenMasked}`;
  }
  return channel.bcc.join(", ");
}

interface ChannelsPanelProps {
  client: Client;
  onClose: () => void;
}

/**
 * Per-client channels editor. The server list (#44b) is the single source of
 * truth: it is fetched on open and refetched after every mutation via query
 * invalidation. Telegram rows show the server-masked token only — the raw
 * token exists solely in the create request.
 */
export function ChannelsPanel({ client, onClose }: ChannelsPanelProps) {
  const [form, setForm] = useState<ChannelForm>(EMPTY_FORM);
  const channelsQuery = useChannels(client.id);
  const channels = channelsQuery.data ?? [];
  const createChannel = useCreateChannel(client.id);
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();

  const submit = (): void => {
    createChannel.mutate(buildCreateBody(form), {
      onSuccess: () => setForm(EMPTY_FORM),
    });
  };

  const toggle = (channel: { id: string; active: boolean }, active: boolean): void => {
    updateChannel.mutate({ id: channel.id, patch: { active } });
  };

  const remove = (channel: { id: string }): void => {
    deleteChannel.mutate(channel.id);
  };

  const queryError =
    channelsQuery.error instanceof Error ? channelsQuery.error.message : null;
  const mutationError =
    createChannel.error instanceof Error
      ? createChannel.error.message
      : updateChannel.error instanceof Error
        ? updateChannel.error.message
        : deleteChannel.error instanceof Error
          ? deleteChannel.error.message
          : null;

  return (
    <Modal open onClose={onClose} title={`Channels — ${client.name}`}>
      {channelsQuery.isPending ? (
        <p className="text-sm text-slate-500">Loading channels…</p>
      ) : channels.length === 0 ? (
        <p className="text-sm text-slate-500">No channels yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">Type</th>
              <th scope="col" className="py-2 pr-4 font-medium">Target</th>
              <th scope="col" className="py-2 pr-4 font-medium">Active</th>
              <th scope="col" className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => (
              <tr key={channel.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-900">{channel.type}</td>
                <td className="py-2 pr-4 text-slate-700">
                  {channelSummary(channel)}
                </td>
                <td className="py-2 pr-4">
                  <label className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={channel.active}
                      onChange={(event) =>
                        toggle(channel, event.target.checked)
                      }
                    />
                    {channel.active ? "Active" : "Inactive"}
                  </label>
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => remove(channel)}
                    className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4"
      >
        <span className="text-sm font-medium text-slate-700">Add channel</span>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Type</span>
          <select
            value={form.type}
            onChange={(event) =>
              setForm({
                ...form,
                type: event.target.value as ChannelType,
              })
            }
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
          >
            <option value="WHATSAPP">WHATSAPP</option>
            <option value="TELEGRAM">TELEGRAM</option>
            <option value="EMAIL">EMAIL</option>
          </select>
        </label>
        {form.type !== "EMAIL" ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Chat ID</span>
            <input
              required
              value={form.chatId}
              onChange={(event) => setForm({ ...form, chatId: event.target.value })}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
            />
          </label>
        ) : null}
        {form.type === "TELEGRAM" ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Bot token</span>
            <input
              required
              type="password"
              autoComplete="off"
              value={form.token}
              onChange={(event) => setForm({ ...form, token: event.target.value })}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
            />
          </label>
        ) : null}
        {form.type === "EMAIL" ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">
              BCC addresses
            </span>
            <input
              required
              value={form.bcc}
              onChange={(event) => setForm({ ...form, bcc: event.target.value })}
              placeholder="a@corp.io, b@corp.io"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
            />
          </label>
        ) : null}
        {queryError !== null || mutationError !== null ? (
          <p role="alert" className="text-sm text-red-600">
            {queryError ?? mutationError}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={createChannel.isPending}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Add channel
          </button>
        </div>
      </form>
    </Modal>
  );
}
