import { Modal } from "../../components/Modal";

interface AiHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/** Explains the two AI flows: strict fill drafts only from ticket materials,
 * enrich researches extra context into a review-gated suggestion queue. */
export function AiHelpModal({ open, onClose }: AiHelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="How Fill & Enrich work">
      <div className="flex flex-col gap-4">
        <section>
          <h3 className="text-sm font-semibold text-slate-900">AI fill (strict)</h3>
          <p className="mt-1">
            Drafts missing final fields only from this ticket's materials — working
            notes, sources and IOCs. It never invents facts and fills only empty
            fields; anything already written is left untouched.
          </p>
          <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
            Example: working note “CVE-2024-1234 affects X 1.2” becomes a
            Description paragraph such as “CVE-2024-1234 affects X 1.2; versions
            before 1.3 are exposed.” — built strictly from what the note already
            says.
          </p>
        </section>
        <section>
          <h3 className="text-sm font-semibold text-slate-900">AI enrich</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              It researches extra context beyond the ticket's own materials.
            </li>
            <li>
              Every item lands as a PENDING suggestion you must Accept/Edit/Reject —
              nothing changes until you decide.
            </li>
            <li>
              Accepted items merge into the final fields automatically, no manual
              copy needed.
            </li>
            <li>
              You can reject any item; rejected suggestions stay logged in the
              activity history.
            </li>
            <li>Send and OTX push are blocked while any suggestion is pending.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
