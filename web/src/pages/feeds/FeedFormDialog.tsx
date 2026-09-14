import { useState } from "react";
import { Modal } from "../../components/Modal";
import type { FeedSource, FeedSourceInput } from "../../lib/feedsApi";
import { useCreateFeed, useUpdateFeed } from "../../lib/useFeeds";

const EMPTY_FORM: FeedSourceInput = { name: "", url: "", active: true };

interface FeedFormDialogProps {
  /** Source being edited, or null for create. */
  source: FeedSource | null;
  onClose: () => void;
}

/**
 * CONTRACT: the parent must remount this dialog per open (key by source id,
 * or a constant for create) — form seeding and fresh mutation state rely on it.
 */
export function FeedFormDialog({ source, onClose }: FeedFormDialogProps) {
  const [form, setForm] = useState<FeedSourceInput>(() =>
    source === null
      ? EMPTY_FORM
      : { name: source.name, url: source.url, active: source.active },
  );
  const createFeed = useCreateFeed();
  const updateFeed = useUpdateFeed();

  const submit = (): void => {
    if (source === null) {
      createFeed.mutate(form, { onSuccess: onClose });
    } else {
      updateFeed.mutate(
        { id: source.id, patch: form },
        { onSuccess: onClose },
      );
    }
  };

  const error =
    createFeed.error instanceof Error
      ? createFeed.error.message
      : updateFeed.error instanceof Error
        ? updateFeed.error.message
        : null;
  const saving = createFeed.isPending || updateFeed.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      title={source === null ? "Add feed" : "Edit feed"}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">URL</span>
          <input
            required
            type="url"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) =>
              setForm({ ...form, active: event.target.checked })
            }
          />
          Active (poll this source)
        </label>
        {error !== null ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
