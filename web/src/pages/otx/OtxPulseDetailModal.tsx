import { Modal } from "../../components/Modal";
import { formatTimestamp } from "../../lib/datetime";
import { useOtxPulseDetail } from "../../lib/useBulletin";

interface OtxPulseDetailModalProps {
  pulseId: string;
  name: string;
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

function WibDate({ iso }: { iso: string | null }) {
  if (iso === null) return <>—</>;
  return (
    <span title={iso}>
      {formatTimestamp(iso)} WIB
    </span>
  );
}

export function OtxPulseDetailModal({ pulseId, name, onClose }: OtxPulseDetailModalProps) {
  const detail = useOtxPulseDetail(pulseId);

  const grouped = new Map<string, string[]>();
  for (const indicator of detail.data?.indicators ?? []) {
    const values = grouped.get(indicator.type) ?? [];
    values.push(indicator.value);
    grouped.set(indicator.type, values);
  }

  return (
    <Modal open onClose={onClose} title="Pulse details">
      {detail.isPending ? (
        <p className="text-sm text-slate-500">Loading pulse detail…</p>
      ) : detail.isError || detail.data === undefined ? (
        <p role="alert" className="text-sm text-red-600">
          {detail.error instanceof Error ? detail.error.message : "Failed to load the pulse detail."}
        </p>
      ) : (
        <dl className="text-sm">
          <DetailRow label="Name">{detail.data.name === "" ? name : detail.data.name}</DetailRow>
          <DetailRow label="Description">{detail.data.description === "" ? "—" : detail.data.description}</DetailRow>
          <DetailRow label="TLP">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {detail.data.tlp}
            </span>
          </DetailRow>
          <DetailRow label="Visibility">{detail.data.isPublic ? "Public" : "Private"}</DetailRow>
          {!detail.data.isPublic ? (
            <p className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
              Private pulse — visible because the configured OTX key can access it.
            </p>
          ) : null}
          <DetailRow label="Tags">
            {detail.data.tags.length === 0 ? "—" : detail.data.tags.join(", ")}
          </DetailRow>
          <DetailRow label="References">
            {detail.data.references.length === 0 ? (
              "—"
            ) : (
              <ul className="space-y-1">
                {detail.data.references.map((reference) => (
                  <li key={reference} className="min-w-0">
                    <a
                      href={reference}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-indigo-600 hover:text-indigo-500"
                    >
                      {reference}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </DetailRow>
          <DetailRow label="Indicators">
            {grouped.size === 0 ? (
              "—"
            ) : (
              <div className="space-y-2">
                {[...grouped.entries()].map(([type, values]) => (
                  <div key={type}>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{type}</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {values.map((value) => (
                        <li key={value} className="break-all font-mono text-xs text-slate-900">
                          {value}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </DetailRow>
          <DetailRow label="Created">
            <WibDate iso={detail.data.created} />
          </DetailRow>
          <DetailRow label="Modified">
            <WibDate iso={detail.data.modified} />
          </DetailRow>
        </dl>
      )}
    </Modal>
  );
}
