import { useState } from "react";
import { copyText } from "../lib/clipboard";

const FEEDBACK_MS = 2000;

interface CopyButtonProps {
  /** Raw string written to the clipboard — never innerText, so \n survives. */
  text: string;
  label: string;
  /** Accessible name when it should differ from the visible label. */
  ariaLabel?: string;
  className?: string;
  feedbackClassName?: string;
}

/** Button that copies `text` and flashes a "Copied" status beside it. */
export function CopyButton({
  text,
  label,
  ariaLabel,
  className,
  feedbackClassName,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = (): void => {
    void copyText(text).then((ok) => {
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), FEEDBACK_MS);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={onCopy}
        disabled={text === ""}
        aria-label={ariaLabel}
        className={
          className ??
          "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        }
      >
        {label}
      </button>
      {copied ? (
        <span role="status" className={feedbackClassName ?? "text-xs text-emerald-700"}>
          Copied
        </span>
      ) : null}
    </>
  );
}
