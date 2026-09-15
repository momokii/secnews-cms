import { useState } from "react";
import type { IntegrationKind } from "../../lib/integrationsApi";
import { AI_PROVIDERS } from "../../lib/ticketsTypes";
import {
  useIntegrationConfig,
  usePutIntegrationConfig,
  useTestIntegration,
} from "../../lib/useIntegrations";

const KIND_LABELS: Record<IntegrationKind, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GEMINI: "Gemini",
  DEEPSEEK: "DeepSeek",
  OTX: "OTX",
  SMTP: "SMTP",
  WAHA: "WAHA",
};

const AI_KINDS: readonly IntegrationKind[] = AI_PROVIDERS;

interface IntegrationCardProps {
  kind: IntegrationKind;
  /** One-line provider blurb shown under the card title. */
  description?: string;
}

/**
 * One credential card. CONTRACT (FE-INT-01): the key input starts empty — the
 * server only ever sends the masked key, and Save issues a PUT only when a
 * fresh raw key was typed, so the masked form can never be resubmitted.
 */
export function IntegrationCard({ kind, description }: IntegrationCardProps) {
  const configQuery = useIntegrationConfig(kind);
  const putConfig = usePutIntegrationConfig(kind);
  const testConnection = useTestIntegration(kind);

  const [apiKey, setApiKey] = useState("");
  /** null = untouched — the field then mirrors the server-side model. */
  const [modelDraft, setModelDraft] = useState<string | null>(null);

  const config = configQuery.data;
  const isAiKind = AI_KINDS.includes(kind);
  const model = modelDraft ?? config?.model ?? "";

  const submit = (): void => {
    if (apiKey === "") return;
    putConfig.mutate(
      isAiKind && model !== "" ? { apiKey, model } : { apiKey },
      { onSuccess: () => setApiKey("") },
    );
  };

  const testResult = testConnection.data;

  return (
    <section
      aria-label={kind}
      className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {KIND_LABELS[kind]}
          </h2>
          {description !== undefined ? (
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {configQuery.isPending ? (
          <span className="text-sm text-slate-500">Loading…</span>
        ) : configQuery.isError ? (
          <span role="alert" className="text-sm text-red-600">
            Failed to load configuration.
          </span>
        ) : config?.hasKey === true ? (
          <span className="text-sm text-slate-500">
            Current key:{" "}
            <code className="text-slate-700">{config.maskedKey}</code>
          </span>
        ) : (
          <span className="text-sm text-slate-500">No key configured</span>
        )}
      </div>

      <div className="mt-4 grid gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">API key</span>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              config?.hasKey === true ? "Enter new key to replace" : "Paste key"
            }
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
          />
        </label>
        {isAiKind ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Model</span>
            <input
              type="text"
              value={model}
              onChange={(event) => setModelDraft(event.target.value)}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
            />
            {config?.model ? (
              <span className="text-xs text-slate-500">
                Server default: {config.model}
              </span>
            ) : null}
          </label>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={putConfig.isPending}
          title="Enter a new key to save — the server never returns the original"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => testConnection.mutate()}
          disabled={testConnection.isPending}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Test connection
        </button>
        {putConfig.error !== null ? (
          <span role="alert" className="text-sm text-red-600">
            {putConfig.error instanceof Error
              ? putConfig.error.message
              : "Save failed."}
          </span>
        ) : null}
      </div>

      {testConnection.isPending ? (
        <p role="status" className="mt-2 text-sm text-slate-500">
          Testing connection…
        </p>
      ) : testResult !== undefined ? (
        testResult.ok ? (
          <p role="status" className="mt-2 text-sm font-medium text-emerald-600">
            OK
            {testResult.latencyMs !== undefined
              ? ` · ${testResult.latencyMs} ms`
              : ""}
          </p>
        ) : (
          <p role="alert" className="mt-2 text-sm font-medium text-red-600">
            Failed
            {testResult.detail !== undefined ? `: ${testResult.detail}` : ""}
          </p>
        )
      ) : null}
    </section>
  );
}
