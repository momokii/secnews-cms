import { useState } from "react";
import { type ExportType } from "../lib/exportsApi";
import { ExportDialog } from "./ExportDialog";

export interface ExportButtonProps {
  readonly type: ExportType;
  readonly label?: string;
  readonly className?: string;
}

export function ExportButton({
  type,
  label = "Export",
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        }
      >
        {label}
      </button>
      {open ? <ExportDialog open={open} type={type} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
