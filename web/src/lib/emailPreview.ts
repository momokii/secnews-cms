/** Client-side preview renderer for the email template studio: substitutes
 * the same placeholder set the backend renderEmailTemplate handles, with a
 * fixed sample ticket, into a self-contained HTML document for the sandboxed
 * iframe. Values are escaped exactly like delivery-time rendering. */

export const EMAIL_PLACEHOLDER_LEGEND = [
  { token: "{{title}}", gloss: "Ticket title" },
  { token: "{{overview}}", gloss: "Executive overview" },
  { token: "{{description}}", gloss: "Detailed description" },
  { token: "{{recommendations}}", gloss: "Recommended actions" },
  { token: "{{references}}", gloss: "Source references" },
  { token: "{{iocs}}", gloss: "Defanged IOC list" },
  { token: "{{tlp}}", gloss: "TLP level" },
  { token: "{{findingType}}", gloss: "Finding type" },
] as const;

export type EmailSampleTicket = {
  title: string;
  tlp: string;
  findingType: string;
  overview: string;
  description: string;
  recommendations: string;
  references: string[];
  iocs: string;
};

const EMAIL_SAMPLE_TICKET: EmailSampleTicket = {
  title: "VPN appliance takeover",
  tlp: "AMBER",
  findingType: "THREAT_CAMPAIGN",
  overview: "Adversaries exploit edge devices to gain initial access.",
  description: "Observed intrusions chain an auth bypass with a web shell drop.",
  recommendations: "Patch to the fixed release and rotate device credentials.",
  references: ["https://example.com/advisory", "https://example.com/writeup"],
  iocs: "- DOMAIN evil[.]example\n- IPV4 203[.]0[.]113[.]7",
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const TOKEN = /\{\{(title|overview|description|recommendations|references|iocs|tlp|findingType)\}\}/g;

function sampleValue(name: string, ticket: EmailSampleTicket): string {
  switch (name) {
    case "title":
      return ticket.title;
    case "overview":
      return ticket.overview;
    case "description":
      return ticket.description;
    case "recommendations":
      return ticket.recommendations;
    case "references":
      return ticket.references.join("\n");
    case "iocs":
      return ticket.iocs;
    case "tlp":
      return ticket.tlp;
    case "findingType":
      return ticket.findingType;
    default: {
      return name;
    }
  }
}

/** Renders the edited HTML with the sample ticket; unknown tokens stay
 * literal, matching the backend renderer. */
export function renderEmailPreview(htmlBody: string, ticket: EmailSampleTicket = EMAIL_SAMPLE_TICKET): string {
  const body = htmlBody.replace(TOKEN, (_match, name: string) =>
    escapeHtml(sampleValue(name, ticket)).replaceAll("\n", "<br />"),
  );
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;">${body}</body></html>`;
}
