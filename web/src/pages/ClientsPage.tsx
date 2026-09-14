import { useState } from "react";
import { Modal } from "../components/Modal";
import type { Client } from "../lib/clientsApi";
import {
  useClients,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from "../lib/useClients";
import { ChannelsPanel } from "./channels/ChannelsPanel";

interface FormDialogState {
  open: boolean;
}

export function ClientsPage() {
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState<FormDialogState>({ open: false });
  const [newName, setNewName] = useState("");
  const [channelsTarget, setChannelsTarget] = useState<Client | null>(null);

  const clientsQuery = useClients(page);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const clients = clientsQuery.data?.items ?? [];
  const total = clientsQuery.data?.total ?? 0;
  const pageSize = clientsQuery.data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const submitNewClient = (): void => {
    if (newName === "") return;
    createClient.mutate(
      { name: newName },
      {
        onSuccess: () => {
          setNewName("");
          setFormOpen({ open: false });
        },
      },
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Clients</h1>
        <button
          type="button"
          onClick={() => setFormOpen({ open: true })}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"
        >
          Add client
        </button>
      </div>

      {clientsQuery.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading clients…</p>
      ) : clientsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {clientsQuery.error instanceof Error
            ? clientsQuery.error.message
            : "Failed to load clients."}
        </p>
      ) : clients.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No clients yet. Add one, then attach delivery channels.
        </p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">Name</th>
              <th scope="col" className="py-2 pr-4 font-medium">Active</th>
              <th scope="col" className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-900">{client.name}</td>
                <td className="py-2 pr-4">
                  <label className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={client.active}
                      onChange={(event) =>
                        updateClient.mutate({
                          id: client.id,
                          patch: { active: event.target.checked },
                        })
                      }
                    />
                    {client.active ? "Active" : "Inactive"}
                  </label>
                </td>
                <td className="py-2">
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setChannelsTarget(client)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      Channels
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteClient.mutate(client.id)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {page} of {totalPages} — {total} clients
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </span>
      </div>

      {formOpen.open ? (
        <Modal
          open
          onClose={() => setFormOpen({ open: false })}
          title="Add client"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitNewClient();
            }}
            className="flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Name</span>
              <input
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            {createClient.error !== null ? (
              <p role="alert" className="text-sm text-red-600">
                {createClient.error instanceof Error
                  ? createClient.error.message
                  : "Failed to create client."}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen({ open: false })}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createClient.isPending}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {channelsTarget !== null ? (
        <ChannelsPanel
          key={channelsTarget.id}
          client={channelsTarget}
          onClose={() => setChannelsTarget(null)}
        />
      ) : null}
    </section>
  );
}
