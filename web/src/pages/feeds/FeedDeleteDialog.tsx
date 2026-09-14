import { Modal } from "../../components/Modal";
import type { FeedSource } from "../../lib/feedsApi";
import { useDeleteFeed } from "../../lib/useFeeds";

interface FeedDeleteDialogProps {
  /** Source to delete; null keeps the dialog closed. */
  source: FeedSource | null;
  onClose: () => void;
}

/** Confirmation dialog for DELETE /feeds/:id. */
export function FeedDeleteDialog({ source, onClose }: FeedDeleteDialogProps) {
  const deleteFeed = useDeleteFeed();

  return (
    <Modal open={source !== null} onClose={onClose} title="Delete feed">
      {source !== null ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            deleteFeed.mutate(source.id, { onSuccess: onClose });
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-slate-700">
            Delete “{source.name}”? Polled items already ingested are kept.
          </p>
          {deleteFeed.error instanceof Error ? (
            <p role="alert" className="text-sm text-red-600">
              {deleteFeed.error.message}
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
              disabled={deleteFeed.isPending}
              className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
