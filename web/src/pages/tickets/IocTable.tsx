import { useState } from "react";
import {
  IOC_TYPES,
  type Ioc,
  type IocType,
} from "../../lib/ticketsApi";
import { useAddIoc, useDeleteIoc, useUpdateIoc } from "../../lib/useTickets";

interface IocTableProps {
  ticketId: string;
  iocs: Ioc[];
}

const inputClass =
  "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none";

/** Indicator table: create with one of the 12 types, toggle includeInBulletin
 * per row (only included IOCs reach the bulletin + OTX push), delete. */
export function IocTable({ ticketId, iocs }: IocTableProps) {
  const [type, setType] = useState<IocType>("DOMAIN");
  const [value, setValue] = useState("");
  const [context, setContext] = useState("");
  const addIoc = useAddIoc();
  const updateIoc = useUpdateIoc();
  const deleteIoc = useDeleteIoc();

  const submit = (): void => {
    addIoc.mutate(
      {
        id: ticketId,
        body: {
          type,
          value: value.trim(),
          ...(context.trim() === "" ? {} : { context: context.trim() }),
          includeInBulletin: true,
        },
      },
      {
        onSuccess: () => {
          setValue("");
          setContext("");
        },
      },
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Indicators (IOCs)</h2>

      {iocs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No indicators yet.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">Type</th>
              <th scope="col" className="py-2 pr-4 font-medium">Value</th>
              <th scope="col" className="py-2 pr-4 font-medium">Context</th>
              <th scope="col" className="py-2 pr-4 font-medium">In bulletin</th>
              <th scope="col" className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {iocs.map((ioc) => (
              <tr key={ioc.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-700">{ioc.type}</td>
                <td className="py-2 pr-4 font-mono text-slate-900">{ioc.value}</td>
                <td className="py-2 pr-4 text-slate-500">{ioc.context ?? "—"}</td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    aria-label={`Include ${ioc.value} in bulletin`}
                    checked={ioc.includeInBulletin}
                    onChange={(event) =>
                      updateIoc.mutate({
                        id: ticketId,
                        iocId: ioc.id,
                        patch: { includeInBulletin: event.target.checked },
                      })
                    }
                  />
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    aria-label={`Delete ${ioc.value}`}
                    onClick={() => deleteIoc.mutate({ id: ticketId, iocId: ioc.id })}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
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
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim() !== "") submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Type</span>
          <select
            aria-label="IOC type"
            value={type}
            onChange={(event) => setType(event.target.value as IocType)}
            className={inputClass}
          >
            {IOC_TYPES.map((iocType) => (
              <option key={iocType} value={iocType}>
                {iocType}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Value</span>
          <input
            aria-label="IOC value"
            type="text"
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={`${inputClass} w-72 font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Context</span>
          <input
            aria-label="IOC context"
            type="text"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            className={`${inputClass} w-56`}
          />
        </label>
        <button
          type="submit"
          disabled={value.trim() === "" || addIoc.isPending}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Add IOC
        </button>
        {addIoc.isError ? (
          <p role="alert" className="w-full text-sm text-red-600">
            {addIoc.error instanceof Error ? addIoc.error.message : "Failed to add IOC."}
          </p>
        ) : null}
      </form>
    </section>
  );
}
