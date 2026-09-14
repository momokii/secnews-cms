import { Modal } from "../../components/Modal";
import { formatTimestamp } from "../../lib/datetime";
import type { FeedItem } from "../../lib/feedsApi";
import { useFeedItem } from "../../lib/useFeeds";

interface FeedItemDetailModalProps {
  item: FeedItem;
  onClose: () => void;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-900">{children}</dd>
    </div>
  );
}

export function FeedItemDetailModal({ item, onClose }: FeedItemDetailModalProps) {
  const detail = useFeedItem(item.id);
  const view = detail.data ?? item;

  return (
    <Modal open onClose={onClose} title="Item details">
      <dl className="text-sm">
        <DetailRow label="Title">{view.title}</DetailRow>
        <DetailRow label="Source">{view.sourceName ?? "—"}</DetailRow>
        <DetailRow label="URL">
          {view.url === null ? (
            "—"
          ) : (
            <a
              href={view.url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-indigo-600 hover:text-indigo-500"
            >
              {view.url}
            </a>
          )}
        </DetailRow>
        <DetailRow label="Published">
          <span title={view.publishedAt ?? undefined}>
            {view.publishedAt === null ? "—" : `${formatTimestamp(view.publishedAt)} WIB`}
          </span>
        </DetailRow>
        <DetailRow label="Added">
          <span title={view.fetchedAt}>{formatTimestamp(view.fetchedAt)} WIB</span>
        </DetailRow>
        <DetailRow label="Status">{view.status}</DetailRow>
        {view.summary !== null ? (
          <DetailRow label="Summary">{view.summary}</DetailRow>
        ) : null}
      </dl>

      {detail.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading raw payload…</p>
      ) : detail.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          Raw payload unavailable — showing normalized fields only.
        </p>
      ) : (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Raw JSON
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(detail.data?.raw, null, 2)}
          </pre>
        </details>
      )}
    </Modal>
  );
}
