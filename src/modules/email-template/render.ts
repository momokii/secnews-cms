import { renderIocBlock, type BulletinIoc } from "../bulletin/render.js";

/**
 * HTML email template rendering (pure). Ticket values are HTML-escaped before
 * they enter the template; newlines inside substituted values become <br />.
 * Unknown {{...}} tokens stay literal. The subject is a plain-text header, so
 * it substitutes raw values without escaping.
 */

export const DEFAULT_EMAIL_SUBJECT = "Security Bulletin: {{title}}";

export const DEFAULT_EMAIL_TEMPLATE_NAME = "default";

export const DEFAULT_EMAIL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{title}}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#4f46e5;padding:20px 24px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#c7d2fe;">Security bulletin</p>
                <h1 style="margin:0;font-size:20px;line-height:1.35;color:#ffffff;">{{title}}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">
                <strong>TLP:{{tlp}}</strong> &middot; {{findingType}}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0;">
                <h2 style="margin:0 0 6px;font-size:14px;color:#0f172a;">Overview</h2>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{{overview}}</p>
                <h2 style="margin:18px 0 6px;font-size:14px;color:#0f172a;">Description</h2>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{{description}}</p>
                <h2 style="margin:18px 0 6px;font-size:14px;color:#0f172a;">Indicators of Compromise (defanged)</h2>
                <pre style="margin:0;padding:12px;background-color:#0f172a;color:#e2e8f0;border-radius:6px;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;">{{iocs}}</pre>
                <h2 style="margin:18px 0 6px;font-size:14px;color:#0f172a;">Recommendations</h2>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{{recommendations}}</p>
                <h2 style="margin:18px 0 6px;font-size:14px;color:#0f172a;">References</h2>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#4f46e5;word-break:break-all;">{{references}}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;line-height:1.6;color:#94a3b8;">Delivered by SecNews CMS. Handle per TLP:{{tlp}} — do not redistribute beyond the marked handling caveats.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const EMAIL_PLACEHOLDERS = [
  "title",
  "overview",
  "description",
  "recommendations",
  "references",
  "iocs",
  "tlp",
  "findingType",
] as const;
export type EmailPlaceholder = (typeof EMAIL_PLACEHOLDERS)[number];

const HTML_TOKEN = /\{\{(title|overview|description|recommendations|references|iocs|tlp|findingType)\}\}/g;

export type EmailTemplateTicket = {
  title: string;
  findingType: string;
  tlp: string;
  overview: string | null;
  description: string | null;
  recommendations: string | null;
  references: string[];
  iocs: BulletinIoc[];
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Raw substitution value — \n-joined; the HTML path escapes + <br />s it. */
function rawValue(name: EmailPlaceholder, ticket: EmailTemplateTicket): string {
  switch (name) {
    case "title":
      return ticket.title;
    case "tlp":
      return ticket.tlp;
    case "findingType":
      return ticket.findingType;
    case "overview":
      return ticket.overview ?? "";
    case "description":
      return ticket.description ?? "";
    case "recommendations":
      return ticket.recommendations ?? "";
    case "references":
      return ticket.references.join("\n");
    case "iocs":
      return renderIocBlock(ticket.iocs);
    default: {
      const unreachable: never = name;
      return unreachable;
    }
  }
}

export function renderEmailTemplate(
  template: { subject: string; htmlBody: string },
  ticket: EmailTemplateTicket,
): { subject: string; html: string } {
  const html = template.htmlBody.replace(
    HTML_TOKEN,
    (_match, name: EmailPlaceholder) => escapeHtml(rawValue(name, ticket)).replaceAll("\n", "<br />"),
  );
  const subject = template.subject.replace(
    HTML_TOKEN,
    (_match, name: EmailPlaceholder) => rawValue(name, ticket),
  );
  return { subject, html };
}
