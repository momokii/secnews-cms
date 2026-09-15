import { useState } from "react";
import type {
  IntegrationConfigResponse,
  IntegrationKind,
  PutIntegrationConfigBody,
} from "../../lib/integrationsApi";
import {
  useIntegrationConfig,
  usePutIntegrationConfig,
  useTestIntegration,
} from "../../lib/useIntegrations";

export interface FieldSpec {
  key: string;
  label: string;
  inputType: "text" | "password" | "number";
  /** GET echo of a non-secret value — seeds the draft once config loads. */
  plain?: (config: IntegrationConfigResponse) => string | null;
  /** GET echo of a secret, masked server-side — shown, never seeded. */
  masked?: (config: IntegrationConfigResponse) => string | null;
}

interface FieldsCardProps {
  kind: IntegrationKind;
  title: string;
  description: string;
  fields: readonly FieldSpec[];
  buildBody: (values: Record<string, string>) => PutIntegrationConfigBody;
}

/**
 * Credential card for kinds with structured fields (SMTP, WAHA). CONTRACT
 * (FE-INT-01, extended): secrets start empty — the server sends masked forms
 * only, and Save issues a PUT only when every field holds a value, so a
 * masked secret can never be resubmitted.
 */
export function FieldsCard({
  kind,
  title,
  description,
  fields,
  buildBody,
}: FieldsCardProps) {
  const configQuery = useIntegrationConfig(kind);
  const putConfig = usePutIntegrationConfig(kind);
  const testConnection = useTestIntegration(kind);

  /** null = untouched — plain fields then mirror the server-side config. */
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);

  const config = configQuery.data;
  const seed = (): Record<string, string> =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        config !== undefined && field.plain !== undefined
          ? (field.plain(config) ?? "")
          : "",
      ]),
    );
  const values = drafts ?? seed();

  type MaskedReader = NonNullable<FieldSpec["masked"]>;
  const maskedEntry = fields.find(
    (field): field is FieldSpec & { masked: MaskedReader } =>
      field.masked !== undefined,
  );
  const maskedValue =
    config === undefined || maskedEntry === undefined
      ? null
      : (maskedEntry.masked(config) ?? null);

  const change = (key: string, next: string): void => {
    setDrafts({ ...values, [key]: next });
  };

  const submit = (): void => {
    if (fields.some((field) => (values[field.key] ?? "") === "")) return;
    putConfig.mutate(buildBody(values), { onSuccess: () => setDrafts(null) });
  };

  const testResult = testConnection.data;

  return (
    <section
      aria-label={kind}
      className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
        {configQuery.isPending ? (
          <span className="text-sm text-slate-500">Loading…</span>
        ) : configQuery.isError ? (
          <span role="alert" className="text-sm text-red-600">
            Failed to load configuration.
          </span>
        ) : config?.hasKey === true ? (
          <span className="text-sm text-slate-500">
            Configured
            {maskedValue !== null ? (
              <>
                {" "}
                — current secret: <code className="text-slate-700">{maskedValue}</code>
              </>
            ) : null}
          </span>
        ) : (
          <span className="text-sm text-slate-500">Not configured</span>
        )}
      </div>

      <div className="mt-4 grid gap-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">
                {field.label}
              </span>
              <input
                type={field.inputType}
                autoComplete="off"
                value={values[field.key] ?? ""}
                onChange={(event) => change(field.key, event.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            {field.masked !== undefined && maskedValue !== null ? (
              <span className="mt-0.5 block text-xs text-slate-500">
                Current: {maskedValue} — type a new value to replace
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={putConfig.isPending}
          title="Fill every field to save — the server never returns secrets"
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
