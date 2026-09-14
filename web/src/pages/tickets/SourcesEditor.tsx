import { useState } from "react";
import { useAddTicketSource, useDeleteTicketSource } from "../../lib/useTickets";
import type { TicketSource } from "../../lib/ticketsApi";

interface SourcesEditorProps {
  ticketId: string;
  sources: TicketSource[];
}

/** Working-source list: add a url and/or note, remove existing rows. */
export function SourcesEditor({ ticketId, sources }: SourcesEditorProps) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const addSource = useAddTicketSource();
  const deleteSource = useDeleteTicketSource();

  const canAdd = url.trim() !== "" || note.trim() !== "";

  const submit = (): void => {
    addSource.mutate(
      {
        id: ticketId,
        body: {
          ...(url.trim() === "" ? {} : { url: url.trim() }),
          ...(note.trim() === "" ? {} : { note: note.trim() }),
        },
      },
      { onSuccess: () => {
        setUrl("");
        setNote("");
      } },
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Sources</h2>

      {sources.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No sources yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 text-sm"
            >
              <span className="min-w-0">
                {source.url !== null ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:text-indigo-500"
                  >
                    {source.url}
                  </a>
                ) : null}
                {source.note !== null ? (
                  <span className="text-slate-700">{source.note}</span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label="Delete source"
                onClick={() => deleteSource.mutate({ id: ticketId, sourceId: source.id })}
                className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">URL</span>
          <input
            aria-label="Source URL"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className="w-72 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Note</span>
          <input
            aria-label="Source note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why this source matters"
            className="w-72 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!canAdd || addSource.isPending}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Add source
        </button>
        {addSource.isError ? (
          <p role="alert" className="w-full text-sm text-red-600">
            {addSource.error instanceof Error ? addSource.error.message : "Failed to add source."}
          </p>
        ) : null}
      </form>
    </section>
  );
}
