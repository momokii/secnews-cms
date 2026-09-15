import type { ReactNode } from "react";
import type { IntegrationKind } from "../lib/integrationsApi";
import { IntegrationCard } from "./integrations/IntegrationCard";
import { SmtpCard } from "./integrations/SmtpCard";
import { WahaCard } from "./integrations/WahaCard";

const AI_KINDS = ["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK"] as const;
const THREAT_KINDS = ["OTX"] as const;

type KeyedKind = Exclude<IntegrationKind, "SMTP" | "WAHA">;

const KIND_BLURBS: Record<KeyedKind, string> = {
  OPENAI: "GPT models — dependable all-round Fill and Enrich quality.",
  ANTHROPIC: "Claude models — careful long-form drafting.",
  GEMINI: "Google Gemini — fast, cost-efficient runs.",
  DEEPSEEK: "DeepSeek models — strong reasoning at low cost.",
  OTX: "AlienVault Open Threat Exchange key for pushing IOC pulses.",
};

interface IntegrationGroupProps {
  label: string;
  description: string;
  children: ReactNode;
}

function IntegrationGroup({ label, description, children }: IntegrationGroupProps) {
  return (
    <section aria-label={label} className="mt-6">
      <h2 className="text-base font-semibold text-slate-900">{label}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-3 grid gap-4">{children}</div>
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
      >
        {AI_KINDS.map((kind) => (
          <IntegrationCard key={kind} kind={kind} description={KIND_BLURBS[kind]} />
        ))}
      </IntegrationGroup>
      <IntegrationGroup
        label="Threat intel"
        description="The OTX key used to push ticket IOCs to AlienVault pulses."
      >
        {THREAT_KINDS.map((kind) => (
          <IntegrationCard key={kind} kind={kind} description={KIND_BLURBS[kind]} />
        ))}
      </IntegrationGroup>
      <IntegrationGroup
        label="Messaging"
        description="Gateways that deliver WHATSAPP channels — test them straight from the card."
      >
        <WahaCard />
      </IntegrationGroup>
      <IntegrationGroup
        label="Email relay"
        description="The SMTP relay EMAIL channels send through."
      >
        <SmtpCard />
      </IntegrationGroup>
    </section>
  );
}
