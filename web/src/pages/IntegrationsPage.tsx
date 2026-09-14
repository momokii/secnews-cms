import { IntegrationCard } from "./integrations/IntegrationCard";

const KINDS = ["OPENAI", "ANTHROPIC", "GEMINI", "OTX"] as const;

export function IntegrationsPage() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Integrations</h1>
      <p className="mt-1 text-sm text-slate-500">
        AI providers and the OTX key. Keys are stored encrypted — the server
        only ever shows a masked form, so saving always requires typing the
        full key.
      </p>
      <div className="mt-4 grid gap-4">
        {KINDS.map((kind) => (
          <IntegrationCard key={kind} kind={kind} />
        ))}
      </div>
    </section>
  );
}
