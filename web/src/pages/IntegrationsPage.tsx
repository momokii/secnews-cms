import type { IntegrationKind } from "../lib/integrationsApi";
import { IntegrationCard } from "./integrations/IntegrationCard";

const AI_KINDS = ["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK"] as const;
const THREAT_KINDS = ["OTX"] as const;

const KIND_BLURBS: Record<IntegrationKind, string> = {
  OPENAI: "GPT models — dependable all-round Fill and Enrich quality.",
  ANTHROPIC: "Claude models — careful long-form drafting.",
  GEMINI: "Google Gemini — fast, cost-efficient runs.",
  DEEPSEEK: "DeepSeek models — strong reasoning at low cost.",
  OTX: "AlienVault Open Threat Exchange key for pushing IOC pulses.",
};

interface IntegrationGroupProps {
  label: string;
  description: string;
  kinds: readonly IntegrationKind[];
}

function IntegrationGroup({ label, description, kinds }: IntegrationGroupProps) {
  return (
    <section aria-label={label} className="mt-6">
      <h2 className="text-base font-semibold text-slate-900">{label}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-3 grid gap-4">
        {kinds.map((kind) => (
          <IntegrationCard key={kind} kind={kind} description={KIND_BLURBS[kind]} />
        ))}
      </div>
    </section>
  );
}

export function IntegrationsPage() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Integrations</h1>
      <p className="mt-1 text-sm text-slate-500">
        Keys are stored encrypted — the server only ever shows a masked form,
        so saving always requires typing the full key.
      </p>
      <IntegrationGroup
        label="AI providers"
        description="Provider keys for AI Fill and Enrich — every keyed provider becomes selectable in the ticket AI picker."
        kinds={AI_KINDS}
      />
      <IntegrationGroup
        label="Threat intel"
        description="The OTX key used to push ticket IOCs to AlienVault pulses."
        kinds={THREAT_KINDS}
      />
    </section>
  );
}
